/**
 * CKB生态文档处理模块 - 网站抓取器
 * 实现真正的流式处理架构
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
  MIN_CHUNK_LENGTH,
  WEBSITE_CHUNK_BATCH_SIZE,
  OPENAI_API_KEY,
  PG_CONNECTION_STRING,
  PG_VECTOR_TABLE
} from '../core/config.js';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types.js';
import { createLogger } from '../utils/logger.js';
import { splitIntoChunks, createDocumentId } from '../utils/helpers.js';
import {
  createNetworkError,
  createFirecrawlApiError,
  DocumentProcessingError,
  handleError,
  safeExecute,
  wrapError
} from '../utils/errors.js';
import { MastraVectorStore } from '../storage/mastra-vector-store.js';

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
 * 文档块处理回调函数类型
 * 用于处理生成的文档块，比如向量化并存储到数据库
 */
export type DocumentChunkProcessor = (chunks: DocumentChunk[]) => Promise<void>;

/**
 * 爬取统计信息
 */
interface ScrapingStats {
  totalPages: number;     // 爬取的页面总数
  processedPages: number; // 成功处理的页面数
  totalChunks: number;    // 生成的文档块数量
  storedChunks?: number;  // 成功存储的文档块数量
  timeMs: number;         // 处理总耗时
}

/**
 * 使用Firecrawl流式爬取网站内容
 * @param source 文档源
 * @param chunkProcessor 文档块处理器回调函数，用于对生成的文档块执行进一步处理
 * @returns 爬取结果
 */
export async function scrapeWebsiteWithFirecrawl(
  source: DocumentSource, 
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult> {
  logger.info(`使用Firecrawl流式爬取网站: ${source.url}`);
  const startTime = Date.now();

  try {
    // 检查API密钥
    if (!FIRECRAWL_API_KEY) {
      logger.warn('未找到Firecrawl API密钥，回退到传统抓取方法');
      return await scrapeWebsiteOriginalStream(source, chunkProcessor);
    }

    // 确保API密钥格式正确（如果不是以fc-开头，则添加前缀）
    const apiKey = FIRECRAWL_API_KEY.startsWith('fc-') 
      ? FIRECRAWL_API_KEY 
      : `fc-${FIRECRAWL_API_KEY}`;
    
    // 初始化统计信息
    const stats: ScrapingStats = {
      totalPages: 0,
      processedPages: 0,
      totalChunks: 0,
      storedChunks: 0,
      timeMs: 0
    };

    try {
      // 使用crawlUrl方法，采用正确的V1参数格式
      logger.info(`使用crawlUrl方法流式爬取 ${source.url}`);
      
      // 根据最新API文档，使用正确的参数格式，优化爬取配置
      const crawlParams: FirecrawlCrawlParams = {
        url: source.url,
        excludePaths: ['/blog/.*', '/news/.*', '/tags/.*', '/authors/.*'], // 排除多种非文档路径
        includePaths: ['/docs/.*', '/rfcs/.*', '/guide/.*'],  // 只爬取特定路径下的文档
        maxDepth: 1,     // 极大降低最大路径深度，避免爬取过多内容
        limit: 10,       // 进一步减少爬取URL数量
        ignoreSitemap: false,
        ignoreQueryParameters: true,
        allowBackwardLinks: false,
        allowExternalLinks: false,
        scrapeOptions: {
          formats: ['markdown'], // 只获取markdown格式，减少数据量
          onlyMainContent: true,
          waitFor: 300,         // 减少等待时间
          blockAds: true,
          timeout: 8000         // 减少超时时间
        }
      };
      
      // 调用crawlUrl方法
      logger.info(`开始使用crawlUrl流式爬取 ${source.url}，参数: ${JSON.stringify(crawlParams)}`);

      // 发起爬取请求
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
      
      // 检查爬取是否成功启动
      if (!crawlResult || !crawlResult.success || !crawlResult.id) {
        const errorMsg = crawlResult?.error || "爬取启动失败";
        logger.warn(`Firecrawl爬取启动失败: ${errorMsg}`);
        return await scrapeWebsiteOriginalStream(source, chunkProcessor);
      }
      
      // 获取爬取任务ID
      const crawlId = crawlResult.id;
      logger.info(`Firecrawl爬取任务已启动，ID: ${crawlId}`);
      
      // 轮询检查爬取状态
      let isCompleted = false;
      let retryCount = 0;
      const maxRetries = 30; // 超时设置
      
      // 处理单个页面的流式处理函数
      const processPage = async (page: FirecrawlPage): Promise<void> => {
        stats.totalPages++;
        
        try {
          // 处理页面内容
          const pageChunks = await extractPageContent(page, source, stats.totalChunks);
          
          // 更新统计信息
          stats.totalChunks += pageChunks.length;
          stats.processedPages++;
          
          // 如果提供了处理器回调，则调用它处理文档块
          if (chunkProcessor && pageChunks.length > 0) {
            await chunkProcessor(pageChunks);
            // 避免在内存中保留文档块
            pageChunks.length = 0;
          }
          
          // 记录处理状态
          logger.debug(`已处理页面 ${stats.processedPages}/${stats.totalPages}, ` +
            `文档块: ${pageChunks.length}, 总文档块: ${stats.totalChunks}`);
        } catch (error) {
          logger.error(`处理页面失败:`, error);
        } finally {
          // 手动清理页面数据，帮助垃圾回收
          if (page) {
            Object.keys(page).forEach(key => {
              // @ts-ignore
              page[key] = null;
            });
          }
        }
      };
      
      // 批量处理页面的函数
      const processPages = async (pages: FirecrawlPage[]): Promise<void> => {
        if (!pages || pages.length === 0) return;
        
        // 为了避免并行处理过多页面导致内存峰值，使用序列处理
        for (const page of pages) {
          await processPage(page);
          
          // 每处理5个页面尝试手动触发垃圾回收
          if (stats.processedPages % 5 === 0 && global.gc) {
            try {
              global.gc();
              logger.debug("手动触发垃圾回收");
            } catch (e) {
              // 忽略错误
            }
          }
        }
        
        // 清除页面数组引用
        pages.length = 0;
      };
      
      // 开始轮询
      while (!isCompleted && retryCount < maxRetries) {
        // 休眠5秒再检查，增加进度日志
        await new Promise(resolve => setTimeout(resolve, 5000));
        retryCount++;
        
        if (retryCount % 5 === 0) {
          logger.info(`等待爬取完成...已尝试 ${retryCount}/${maxRetries} 次, ` + 
            `已处理 ${stats.processedPages} 个页面，生成 ${stats.totalChunks} 个文档块`);
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
          
          // 流式处理已爬取的页面
          if (statusResult.data && statusResult.data.length > 0) {
            // 流式处理这批数据
            await processPages(statusResult.data);
            
            // 清除数据引用，帮助垃圾回收
            statusResult.data = null;
          }
          
          if (statusResult.status === 'completed') {
            isCompleted = true;
            
            // 处理分页数据（最多只处理第一个分页，避免过多数据）
            if (statusResult.next) {
              try {
                const nextResponse = await axios.get(statusResult.next, {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`
                  }
                });
                
                if (nextResponse.data && nextResponse.data.data) {
                  // 流式处理分页数据
                  await processPages(nextResponse.data.data);
                }
              } catch (error) {
                logger.error(`获取分页数据失败:`, error);
              }
            }
            
            logger.info(`爬取任务已完成，处理了 ${stats.processedPages} 个页面，生成 ${stats.totalChunks} 个文档块`);
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
        logger.warn(`Firecrawl爬取超时，已处理 ${stats.processedPages} 个页面`);
      }
      
      // 如果没有处理任何页面，回退到传统方法
      if (stats.processedPages === 0) {
        logger.warn('Firecrawl未返回有效内容，回退到传统抓取方法');
        return await scrapeWebsiteOriginalStream(source, chunkProcessor);
      }
      
      // 计算处理耗时
      stats.timeMs = Date.now() - startTime;
      logger.info(`完成流式爬取网站 ${source.url}，处理了 ${stats.processedPages} 个页面，` +
        `生成 ${stats.totalChunks} 个文档块，耗时 ${stats.timeMs}ms`);
      
      return {
        success: true,
        chunks: [], // 在流式处理模式下，所有文档块都已通过回调处理，不再返回
        message: `成功使用Firecrawl流式爬取网站 ${source.url}，共处理 ${stats.processedPages} 个页面，生成 ${stats.totalChunks} 个文档块`,
        stats: {
          totalChunks: stats.totalChunks,
          storedChunks: stats.storedChunks,
          totalPages: stats.processedPages,
          timeMs: stats.timeMs
        }
      };
    } catch (error) {
      logger.error(`使用crawlUrl方法爬取 ${source.url} 失败:`, error);
      logger.info(`回退到传统抓取方法...`);
      return await scrapeWebsiteOriginalStream(source, chunkProcessor);
    }
  } catch (error) {
    logger.error(`使用Firecrawl爬取 ${source.url} 失败:`, error);
    logger.info(`回退到传统抓取方法...`);
    return await scrapeWebsiteOriginalStream(source, chunkProcessor);
  }
}

/**
 * 从页面提取内容并生成文档块
 * 优化的内存使用版本
 */
async function extractPageContent(
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
    const maxParagraphsPerPage = 20; // 限制段落处理数量
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
          scraper: 'firecrawl-stream',
          selector: source.selector
        }
      });
    }
    
    // 释放内存
    page.markdown = '';
  } catch (error) {
    logger.error(`处理页面 ${pageUrl} 内容时出错:`, error);
  }
  
  return chunks;
}

/**
 * 使用传统方法流式抓取网站内容
 */
export async function scrapeWebsiteOriginalStream(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult> {
  logger.info(`使用优化的传统方法流式抓取网站: ${source.url}`);
  const startTime = Date.now();
  
  // 初始化统计信息
  const stats: ScrapingStats = {
    totalPages: 1, // 传统方法只处理一个页面
    processedPages: 0,
    totalChunks: 0,
    storedChunks: 0,
    timeMs: 0
  };
  
  // 初始化向量存储
  let vectorStore: MastraVectorStore | null = null;
  
  try {
    // 如果没有提供回调函数，初始化向量存储
    if (!chunkProcessor) {
      if (!OPENAI_API_KEY) {
        logger.warn('未设置OpenAI API密钥，向量化将无法正常工作');
      }
      
      if (!PG_CONNECTION_STRING) {
        logger.warn('未设置PG_CONNECTION_STRING，向量存储将无法正常工作');
      }
      
      vectorStore = new MastraVectorStore({
        apiKey: OPENAI_API_KEY,
        pgConnectionString: PG_CONNECTION_STRING,
        tablePrefix: PG_VECTOR_TABLE,
        batchSize: 10  // 使用较小的批次大小，避免内存压力
      });
      
      const initialized = await vectorStore.initialize();
      if (!initialized) {
        logger.error('向量存储初始化失败');
        throw new Error('向量存储初始化失败');
      }
      
      logger.info('向量存储初始化成功，开始爬取网站');
    }
    
    // 内部处理文档块的函数
    const handleChunks = async (chunks: DocumentChunk[]): Promise<void> => {
      if (!chunks || chunks.length === 0) return;
      
      // 更新统计信息
      stats.totalChunks += chunks.length;
      
      // 如果外部提供了处理器，使用外部处理器
      if (chunkProcessor) {
        await chunkProcessor(chunks);
      } 
      // 否则使用向量存储
      else if (vectorStore) {
        try {
          const startStoreTime = Date.now();
          const storedCount = await vectorStore.storeDocuments(chunks);
          const endStoreTime = Date.now();
          
          stats.storedChunks = (stats.storedChunks || 0) + storedCount;
          logger.info(`成功向量化并存储 ${storedCount}/${chunks.length} 个文档块，耗时 ${endStoreTime - startStoreTime}ms`);
        } catch (error) {
          logger.error('向量化和存储文档时出错:', error);
        }
      }
      
      // 尝试手动垃圾回收
      if (global.gc) {
        try {
          global.gc();
          logger.debug("手动触发垃圾回收");
        } catch (e) {
          // 忽略错误
        }
      }
    };
  
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

    // 清理HTML结构，防止内存占用过高
    // 不要尝试设置$为null（它是const），而是删除对它的引用
    // @ts-ignore 允许将response.data设置为null以释放内存
    response.data = null;

    // 预处理内容，提高质量：清理空白和特殊字符
    content = content
      .replace(/\s+/g, ' ')        // 替换连续空白字符为单个空格
      .replace(/[\r\n]+/g, '\n')   // 规范化换行符
      .trim();                     // 移除首尾空白

    // 分割内容为段落
    const paragraphs = content
      .split(/\n\s*\n/)           // 按空行分割
      .map(p => p.trim())         // 修剪每个段落
      .filter(p => p.length > MIN_CHUNK_LENGTH); // 过滤太短的段落

    // 减小内存压力：将原始内容设为null，帮助垃圾回收
    // @ts-ignore 允许将content设为null以释放内存
    content = null;

    // 批量处理段落，使用小批次减少内存使用
    const batchSize = 5;  // 更小的批次大小，进一步优化内存使用
    const tempChunks: DocumentChunk[] = [];

    logger.info(`开始处理 ${paragraphs.length} 个段落，批次大小 ${batchSize}`);

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      if (paragraph.length < MIN_CHUNK_LENGTH) continue;
      
      // 使用段落索引作为区分，避免重复ID生成算法问题
      const id = createDocumentId(`${source.name}-${i}`, Date.now());
      
      // 创建文档块
      tempChunks.push({
        id,
        content: paragraph,
        title: source.name || '网站文档',
        url: source.url,
        source: source.name,
        category: 'documentation',
        createdAt: Date.now(),
        metadata: {
          scraper: 'website',
          index: i
        }
      });
      
      // 当达到批次大小或是最后一个段落时处理
      if (tempChunks.length >= WEBSITE_CHUNK_BATCH_SIZE || i === paragraphs.length - 1) {
        // 处理并向量化当前批次
        await handleChunks([...tempChunks]);
        
        // 清空临时数组
        tempChunks.length = 0;
        
        // 在大批次之间添加短暂延迟，让事件循环有空处理其他任务
        if (i < paragraphs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // 尝试手动垃圾回收
      if (i > 0 && i % (batchSize * 3) === 0 && global.gc) {
        try {
          global.gc();
          logger.debug("手动触发垃圾回收");
        } catch (e) {
          // 忽略错误
        }
      }
    }
    
    // 处理完成，更新统计信息
    stats.processedPages = 1;
    stats.timeMs = Date.now() - startTime;

    // 关闭向量存储
    if (vectorStore) {
      try {
        await vectorStore.close();
      } catch (error) {
        logger.warn('关闭向量存储时出错:', error);
      }
    }

    logger.info(`从 ${source.url} 流式处理了 ${stats.totalChunks} 个文档片段，` +
                `成功存储了 ${stats.storedChunks || 0} 个文档片段，耗时 ${stats.timeMs}ms`);

    return {
      success: true,
      chunks: [], // 在流式处理模式下，所有文档块都已通过回调处理，不再返回
      message: `成功使用流式处理方法抓取 ${source.url}`,
      stats: {
        totalChunks: stats.totalChunks,
        storedChunks: stats.storedChunks || 0,
        totalPages: stats.processedPages,
        timeMs: stats.timeMs
      }
    };
  } catch (error) {
    // 确保关闭向量存储
    if (vectorStore) {
      try {
        await vectorStore.close();
      } catch (closeError) {
        logger.warn('关闭向量存储时出错:', closeError);
      }
    }
    
    const processedError = error instanceof DocumentProcessingError ? error : wrapError(error);
    logger.error(`抓取 ${source.url} 失败:`, processedError);

    return {
      success: false,
      chunks: [],
      error: processedError,
      message: `抓取 ${source.url} 失败: ${processedError.message}`,
      stats: {
        totalChunks: stats.totalChunks,
        storedChunks: stats.storedChunks || 0,
        totalPages: stats.processedPages,
        timeMs: Date.now() - startTime
      }
    };
  }
}

/**
 * 原始方法，现在已更新为流式处理模式
 */
export async function scrapeWebsiteOriginal(source: DocumentSource, chunkProcessor?: DocumentChunkProcessor): Promise<ScrapingResult> {
  return await scrapeWebsiteOriginalStream(source, chunkProcessor);
}

/**
 * 流式抓取网站，根据配置选择最佳抓取方法
 * @param source 文档源
 * @param chunkProcessor 文档块处理回调，用于对生成的文档块进行进一步处理（比如向量化和存储）
 * @returns 抓取结果
 */
export async function scrapeWebsite(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult> {
  // 根据是否启用Firecrawl决定使用哪种抓取方法
  if (USE_FIRECRAWL) {
    return await scrapeWebsiteWithFirecrawl(source, chunkProcessor);
  } else {
    return await scrapeWebsiteOriginalStream(source, chunkProcessor);
  }
} 