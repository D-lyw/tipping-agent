/**
 * CKB生态文档处理模块 - 网站抓取器
 */

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import FirecrawlApp from '@mendable/firecrawl-js';
import {
  DEFAULT_HTTP_HEADERS,
  DEFAULT_REQUEST_TIMEOUT,
  MAX_REDIRECTS,
  FIRECRAWL_API_KEY,
  FIRECRAWL_API_URL,
  USE_FIRECRAWL,
  MIN_CHUNK_LENGTH
} from '../core/config';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types';
import { createLogger } from '../utils/logger';
import { splitIntoChunks, createDocumentId } from '../utils/helpers';
import {
  createNetworkError,
  createFirecrawlApiError,
  DocumentProcessingError,
  handleError,
  safeExecute,
  wrapError
} from '../utils/errors';

// 初始化日志记录器
const logger = createLogger('WebScraper');

// 为Firecrawl V1 API的接口定义类型
interface FirecrawlCrawlParams {
  url: string;
  excludePaths?: string[];
  includePaths?: string[];
  maxDepth?: number;
  maxDiscoveryDepth?: number;
  ignoreSitemap?: boolean;
  ignoreQueryParameters?: boolean;
  limit?: number;
  allowBackwardLinks?: boolean;
  allowExternalLinks?: boolean;
  webhook?: {
    url?: string;
    headers?: Record<string, string>;
    metadata?: any;
    events?: Array<'completed'|'page'|'failed'|'started'>;
  };
  scrapeOptions?: {
    formats?: Array<'markdown'|'html'|'rawHtml'|'links'|'screenshot'|'screenshot@fullPage'|'json'>;
    onlyMainContent?: boolean;
    includeTags?: string[];
    excludeTags?: string[];
    headers?: Record<string, string>;
    waitFor?: number;
    mobile?: boolean;
    skipTlsVerification?: boolean;
    timeout?: number;
    removeBase64Images?: boolean;
    blockAds?: boolean;
    proxy?: 'basic' | 'stealth';
  };
}

interface FirecrawlPage {
  url?: string;
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface FirecrawlCrawlResponse {
  success?: boolean;
  status?: string;
  id?: string;
  url?: string;
  total?: number;
  completed?: number;
  data?: FirecrawlPage[];
  next?: string;
  error?: string;
  [key: string]: any;
}

interface FirecrawlMapResponse {
  status?: string;
  links?: string[];
  error?: string;
  [key: string]: any;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    [key: string]: any;
  };
  error?: string;
  [key: string]: any;
}

/**
 * 使用Firecrawl抓取网站内容
 */
export async function scrapeWebsiteWithFirecrawl(source: DocumentSource): Promise<ScrapingResult> {
  logger.info(`使用Firecrawl爬取整个网站: ${source.url}`);
  const startTime = Date.now();

  try {
    // 检查API密钥
    if (!FIRECRAWL_API_KEY) {
      logger.warn('未找到Firecrawl API密钥，回退到传统抓取方法');
      return await scrapeWebsiteOriginal(source);
    }

    // 确保API密钥格式正确（如果不是以fc-开头，则添加前缀）
    const apiKey = FIRECRAWL_API_KEY.startsWith('fc-') 
      ? FIRECRAWL_API_KEY 
      : `fc-${FIRECRAWL_API_KEY}`;
    
    // 使用Firecrawl SDK
    const app = new FirecrawlApp({
      apiKey: apiKey,
      // 确保使用V1 API URL
      apiUrl: FIRECRAWL_API_URL
    });

    try {
      // 使用crawlUrl方法，采用正确的V1参数格式
      logger.info(`使用crawlUrl方法爬取 ${source.url}`);
      
      // 根据最新API文档，使用正确的参数格式，显著减少爬取页面数量以避免内存溢出
      const crawlParams: FirecrawlCrawlParams = {
        url: source.url,
        excludePaths: ['/blog/.*', '/news/.*', '/tags/.*', '/authors/.*'], // 排除多种非文档路径
        includePaths: ['/docs/.*', '/rfcs/.*', '/guide/.*'],  // 只爬取特定路径下的文档
        maxDepth: 1,     // 极大降低最大路径深度，避免爬取过多内容
        limit: 15,       // 显著减少爬取URL数量
        ignoreSitemap: false,
        ignoreQueryParameters: true,
        allowBackwardLinks: false,
        allowExternalLinks: false,
        scrapeOptions: {
          formats: ['markdown'], // 只获取markdown格式，减少数据量
          onlyMainContent: true,
          waitFor: 500,         // 减少等待时间
          blockAds: true,
          timeout: 10000        // 减少超时时间
        }
      };
      
      // 调用crawlUrl方法
      logger.info(`开始使用crawlUrl爬取 ${source.url}，参数: ${JSON.stringify(crawlParams)}`);

      // 直接使用axios调用API，而不是使用SDK
      const crawlResponse = await axios.post(
        `${FIRECRAWL_API_URL}/crawl`,
        crawlParams,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const crawlResult = crawlResponse.data;
      logger.info(`Firecrawl爬取响应: ${JSON.stringify(crawlResult, null, 2)}`);
      
      // 检查爬取是否成功启动
      if (!crawlResult || !crawlResult.success || !crawlResult.id) {
        const errorMsg = crawlResult?.error || "爬取启动失败";
        logger.warn(`Firecrawl爬取启动失败: ${errorMsg}`);
        return await scrapeWebsiteOriginal(source);
      }
      
      // 获取爬取任务ID
      const crawlId = crawlResult.id;
      logger.info(`Firecrawl爬取任务已启动，ID: ${crawlId}`);
      
      // 轮询检查爬取状态
      let isCompleted = false;
      let retryCount = 0;
      const maxRetries = 30; // 减少重试次数，2.5分钟超时 (30 * 5秒)
      
      // 避免内存溢出：采用流式处理并返回结果
      let totalPages = 0;
      let totalChunks = 0;
      const resultChunks: DocumentChunk[] = [];
      
      // 创建一个文件处理工作队列，对内存友好
      const processQueue = async (data: FirecrawlPage[]) => {
        if (!data || data.length === 0) return;
        
        // 由于内存问题，限制每批处理的页面数量
        const maxPagesToProcessPerBatch = 5;
        
        // 分批处理页面
        for (let i = 0; i < data.length; i += maxPagesToProcessPerBatch) {
          const batch = data.slice(i, i + maxPagesToProcessPerBatch);
          const batchChunks = await processPageBatch(batch, source, totalChunks);
          
          // 限制每个网站的文档片段总数，防止内存溢出
          const remainingCapacity = 1000 - resultChunks.length;
          if (remainingCapacity <= 0) {
            logger.warn(`已达到最大允许的文档片段数量 (1000)，停止处理更多页面`);
            break;
          }
          
          // 只添加能容纳的数量
          const chunksToAdd = batchChunks.slice(0, remainingCapacity);
          resultChunks.push(...chunksToAdd);
          totalChunks += chunksToAdd.length;
          
          // 尝试手动释放内存
          batch.length = 0;
          if (global.gc) {
            try {
              global.gc();
              logger.info("批处理后手动触发垃圾回收");
            } catch (e) {
              logger.debug("手动垃圾回收调用失败");
            }
          } else {
            // 如果没有手动GC，强制另一种内存释放方式
            setTimeout(() => {}, 100); // 小延迟，让GC有机会运行
          }
          
          // 如果已达到限制，停止处理
          if (resultChunks.length >= 1000) {
            break;
          }
        }
      };
      
      while (!isCompleted && retryCount < maxRetries) {
        // 休眠5秒再检查，增加进度日志
        await new Promise(resolve => setTimeout(resolve, 5000));
        retryCount++;
        
        if (retryCount % 5 === 0) {
          logger.info(`等待爬取完成...已尝试 ${retryCount}/${maxRetries} 次`);
        }
        
        try {
          // 检查爬取状态
          const statusResponse = await axios.get(
            `${FIRECRAWL_API_URL}/crawl/${crawlId}`,
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`
              }
            }
          );
          
          const statusResult = statusResponse.data;
          logger.info(`爬取状态: ${statusResult.status}, 进度: ${statusResult.completed || 0}/${statusResult.total || '未知'}`);
          
          // 立即处理所有可用数据，减少内存使用
          if (statusResult.data && statusResult.data.length > 0) {
            totalPages += statusResult.data.length;
            
            // 处理当前页面批次
            await processQueue(statusResult.data);
            
            // 清除引用，帮助垃圾回收
            statusResult.data = null;
          }
          
          if (statusResult.status === 'completed') {
            isCompleted = true;
            
            // 处理分页数据（最多1页，避免过多数据）
            if (statusResult.next && resultChunks.length < 1000) {
              try {
                const nextResponse = await axios.get(statusResult.next, {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`
                  }
                });
                
                if (nextResponse.data && nextResponse.data.data) {
                  totalPages += nextResponse.data.data.length;
                  await processQueue(nextResponse.data.data);
                  
                  // 清除引用
                  nextResponse.data.data = null;
                }
              } catch (error) {
                logger.error(`获取分页数据失败:`, error);
              }
            }
            
            logger.info(`爬取任务已完成，获取到 ${totalPages} 个页面`);
          } else if (statusResult.status === 'failed') {
            const errorMsg = statusResult.error || "爬取失败";
            logger.warn(`Firecrawl爬取任务失败: ${errorMsg}`);
            break;
          }
        } catch (error) {
          logger.error(`检查爬取状态失败:`, error);
        }
      }
      
      if (retryCount >= maxRetries && !isCompleted) {
        logger.warn(`Firecrawl爬取超时，但将返回已处理的 ${resultChunks.length} 个片段`);
      }
      
      // 如果没有获取到任何文档片段，回退到传统方法
      if (resultChunks.length === 0) {
        logger.warn('Firecrawl未返回有效内容，回退到传统抓取方法');
        return await scrapeWebsiteOriginal(source);
      }
      
      const endTime = Date.now();
      logger.info(`从网站 ${source.url} 提取了 ${resultChunks.length} 个文档片段，涵盖 ${totalPages} 个页面，耗时 ${endTime - startTime}ms`);
      
      return {
        success: true,
        chunks: resultChunks,
        message: `成功使用Firecrawl爬取网站 ${source.url}，共 ${totalPages} 个页面`,
        stats: {
          totalChunks: resultChunks.length,
          totalPages: totalPages,
          timeMs: endTime - startTime
        }
      };
    } catch (error) {
      logger.error(`使用crawlUrl方法爬取 ${source.url} 失败:`, error);
      logger.info(`回退到传统抓取方法...`);
      return await scrapeWebsiteOriginal(source);
    }
  } catch (error) {
    logger.error(`使用Firecrawl爬取 ${source.url} 失败:`, error);
    logger.info(`回退到传统抓取方法...`);
    return await scrapeWebsiteOriginal(source);
  }
}

/**
 * 处理单页内容，返回文档片段
 * 极度优化的内存使用版本
 */
async function processPageContent(
  page: FirecrawlPage, 
  source: DocumentSource, 
  startCounter: number
): Promise<DocumentChunk[]> {
  if (!page.markdown || page.markdown.trim().length === 0) {
    return [];
  }
  
  const chunks: DocumentChunk[] = [];
  let chunkCounter = startCounter;
  
  // 获取页面信息
  const pageUrl = page.metadata?.sourceURL || page.url || source.url;
  const pageTitle = page.metadata?.title || source.name;
  
  try {
    // 分批处理内容，避免大段落
    const paragraphs = splitIntoChunks(page.markdown);
    
    // 限制每页处理的段落数，避免过度处理
    const maxParagraphsPerPage = 25; // 大幅降低每页处理的段落数
    const limitedParagraphs = paragraphs.slice(0, maxParagraphsPerPage);
    
    logger.info(`处理页面 ${pageUrl} 中的 ${limitedParagraphs.length}/${paragraphs.length} 个段落`);
    
    // 为每个段落创建文档片段
    for (const paragraph of limitedParagraphs) {
      // 跳过过短的段落
      if (paragraph.length < MIN_CHUNK_LENGTH) continue;
      
      // 添加文档片段
      chunks.push({
        id: createDocumentId(source.name, chunkCounter++),
        content: paragraph,
        title: pageTitle,
        url: pageUrl,
        source: source.name,
        category: 'documentation',
        createdAt: Date.now(),
        metadata: {
          scraper: 'firecrawl',
          selector: source.selector
        }
      });
    }
  } catch (error) {
    logger.error(`处理页面 ${pageUrl} 内容时出错:`, error);
  }
  
  return chunks;
}

/**
 * 批量处理页面并创建文档片段
 * 优化的内存管理版本
 */
async function processPageBatch(
  pages: FirecrawlPage[], 
  source: DocumentSource,
  startCounter: number
): Promise<DocumentChunk[]> {
  const allChunks: DocumentChunk[] = [];
  let currentCounter = startCounter;
  
  // 逐个处理页面，避免并行处理导致的内存峰值
  for (const page of pages) {
    // 处理页面内容并获取文档片段
    const pageChunks = await processPageContent(page, source, currentCounter);
    
    // 更新计数器
    currentCounter += pageChunks.length;
    
    // 将本页文档片段添加到总集合中
    allChunks.push(...pageChunks);
    
    // 释放当前页面的引用，帮助垃圾回收
    Object.keys(page).forEach(key => {
      // @ts-ignore
      page[key] = null;
    });
  }
  
  return allChunks;
}

/**
 * 使用传统方法抓取网站内容，但采用分页处理以减少内存使用
 */
export async function scrapeWebsiteOriginalWithPagination(source: DocumentSource): Promise<ScrapingResult> {
  logger.info(`使用优化的传统方法抓取网站: ${source.url}`);
  const startTime = Date.now();
  const resultChunks: DocumentChunk[] = [];
  
  try {
    // 配置请求
    const config: AxiosRequestConfig = {
      timeout: DEFAULT_REQUEST_TIMEOUT,
      headers: DEFAULT_HTTP_HEADERS,
      maxRedirects: MAX_REDIRECTS
    };

    // 发送请求
    const response: AxiosResponse = await axios.get(source.url, config);

    if (response.status !== 200) {
      throw createNetworkError(`HTTP错误: ${response.status}`);
    }

    // 使用Cheerio解析HTML
    const $ = cheerio.load(response.data);

    // 使用指定的选择器，或默认选择主要内容
    const contentSelector = source.selector || 'body';

    // 尝试多种选择器
    let content = '';
    if ($(contentSelector).length > 0) {
      content = $(contentSelector).text();
    } else if (source.url.includes('nervos.org')) {
      // 针对Nervos网站的备选选择器
      const alternativeSelectors = [
        'article', '.markdown', '.content',
        'main', '.main-content', '.document-content',
        '.docs-content', '.page-content'
      ];

      for (const selector of alternativeSelectors) {
        if ($(selector).length > 0) {
          logger.info(`使用备选选择器 "${selector}" 提取内容`);
          content = $(selector).text();
          break;
        }
      }

      // 如果仍然没有内容，尝试获取所有文本
      if (!content) {
        content = $('body').text();
      }
    }

    if (!content || content.trim().length === 0) {
      throw new Error('无法提取有效内容');
    }

    // 分段处理，在内存中分块处理内容
    const paragraphs = content
      .split('\n')
      .filter(p => p.trim().length > 0)
      .map(p => p.trim());
    
    // 分批处理段落以减少内存使用
    const batchSize = 50; // 每批处理的段落数
    const totalParagraphs = paragraphs.length;
    
    logger.info(`从 ${source.url} 提取了 ${totalParagraphs} 个原始段落，开始分批处理`);
    
    // 分批处理段落
    for (let i = 0; i < totalParagraphs; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, totalParagraphs);
      const currentBatch = paragraphs.slice(i, batchEnd);
      
      // 将当前批次的段落转化为文档块
      const batchText = currentBatch.join('\n');
      const processedChunks = splitIntoChunks(batchText);
      
      logger.info(`处理第 ${i/batchSize + 1} 批段落，生成了 ${processedChunks.length} 个文档块`);
      
      // 为每个段落创建文档片段
      for (let j = 0; j < processedChunks.length; j++) {
        if (processedChunks[j].length < MIN_CHUNK_LENGTH) continue; // 跳过过短的段落
        
        // 限制最大文档片段数
        if (resultChunks.length >= 1000) {
          logger.warn(`已达到最大允许的文档片段数量 (1000)，停止处理更多内容`);
          break;
        }

        resultChunks.push({
          id: createDocumentId(source.name, resultChunks.length),
          content: processedChunks[j],
          title: source.name,
          url: source.url,
          source: source.name,
          category: 'documentation',
          createdAt: Date.now(),
          metadata: {
            scraper: 'cheerio-optimized',
            selector: source.selector
          }
        });
      }
      
      // 尝试手动垃圾回收
      if (global.gc) {
        try {
          global.gc();
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 如果已达到限制，停止处理
      if (resultChunks.length >= 1000) {
        break;
      }
    }

    const endTime = Date.now();
    logger.info(`从 ${source.url} 提取了 ${resultChunks.length} 个文档片段，耗时 ${endTime - startTime}ms`);

    return {
      success: true,
      chunks: resultChunks,
      message: `成功使用优化的传统方法抓取 ${source.url}`,
      stats: {
        totalChunks: resultChunks.length,
        timeMs: endTime - startTime
      }
    };
  } catch (error) {
    const processedError = error instanceof DocumentProcessingError ? error : wrapError(error);
    logger.error(`抓取 ${source.url} 失败:`, processedError);

    return {
      success: false,
      chunks: [],
      error: processedError,
      message: `抓取 ${source.url} 失败: ${processedError.message}`,
      stats: {
        totalChunks: 0,
        timeMs: Date.now() - startTime
      }
    };
  }
}

/**
 * 原始方法，仅作为兼容保留
 */
export async function scrapeWebsiteOriginal(source: DocumentSource): Promise<ScrapingResult> {
  // 调用新的分页处理方法
  return await scrapeWebsiteOriginalWithPagination(source);
}

/**
 * 抓取网站，根据配置选择最佳抓取方法
 */
export async function scrapeWebsite(source: DocumentSource): Promise<ScrapingResult> {
  // 根据是否启用Firecrawl决定使用哪种抓取方法
  if (USE_FIRECRAWL) {
    return await scrapeWebsiteWithFirecrawl(source);
  } else {
    return await scrapeWebsiteOriginalWithPagination(source);
  }
} 