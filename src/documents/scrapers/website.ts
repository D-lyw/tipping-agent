/**
 * CKB生态文档处理模块 - 网站抓取器
 * 实现真正的流式处理架构
 */

import type { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import FirecrawlApp, { CrawlParams, CrawlStatusResponse } from '@mendable/firecrawl-js';
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
import { Parser } from 'htmlparser2';
import stream from 'stream';
import { MDocument } from '@mastra/rag';

// 初始化日志记录器
const logger = createLogger('WebScraper');

// 动态导入 axios 并创建实例
let axiosInstance: AxiosInstance | null = null;
const getAxios = async () => {
  if (!axiosInstance) {
    const module = await import('axios');
    axiosInstance = module.default;
  }
  return axiosInstance;
};

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
 * 流式处理单个页面内容
 */
async function* streamPageContent(
  page: FirecrawlPage,
  source: DocumentSource,
  startCounter: number
): AsyncGenerator<DocumentChunk> {
  if (!page.markdown || page.markdown.trim().length === 0) {
    return;
  }

  const pageUrl = page.metadata?.sourceURL || page.url || source.url;
  const pageTitle = page.metadata?.title || source.name;
  let chunkCounter = startCounter;

  try {
    // 1. 首先按照 Markdown 标题进行分段
    const sections = page.markdown.split(/^#{1,3}\s+/m);
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      if (!section) continue;

      // 提取段落标题和内容
      let sectionTitle = '';
      let sectionContent = section;
      const firstLineBreak = section.indexOf('\n');
      
      if (firstLineBreak > 0) {
        sectionTitle = section.substring(0, firstLineBreak).trim();
        sectionContent = section.substring(firstLineBreak + 1).trim();
      }

      // 2. 处理代码块，暂时保存它们
      const codeBlocks: string[] = [];
      sectionContent = sectionContent.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
      });

      // 3. 按照语义分隔符分割内容
      const paragraphs = sectionContent
        .split(/(?:(?:\r?\n){2,}|\.|。|！|\!|\?|？)/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      let currentChunk = '';
      let currentCodeBlocks: string[] = [];
      let contextBuffer = ''; // 用于保存上下文

      for (const paragraph of paragraphs) {
        // 检查是否包含代码块引用
        const hasCodeBlock = paragraph.includes('__CODE_BLOCK_');
        let processedParagraph = paragraph;
        
        // 恢复代码块
        if (hasCodeBlock) {
          processedParagraph = processedParagraph.replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => {
            const codeBlock = codeBlocks[parseInt(index)];
            currentCodeBlocks.push(codeBlock);
            return '';
          });
        }

        // 如果当前块加上新段落会超过最大长度，或者遇到代码块，就输出当前块
        if ((currentChunk.length + processedParagraph.length > 1500) || 
            (currentChunk.length >= MIN_CHUNK_LENGTH && hasCodeBlock)) {
          
          if (currentChunk.length >= MIN_CHUNK_LENGTH) {
            // 添加上下文重叠
            const chunkWithContext = contextBuffer + currentChunk;
            
            yield {
              id: createDocumentId(source.name, chunkCounter++),
              content: chunkWithContext.trim(),
              title: sectionTitle || pageTitle,
              url: pageUrl,
              source: source.name,
              category: 'documentation',
              createdAt: Date.now(),
              metadata: {
                scraper: 'firecrawl-stream',
                selector: source.selector,
                sectionTitle: sectionTitle,
                hasCodeBlock: false
              }
            };

            // 保存最后一段作为下一个块的上下文
            const sentences = currentChunk.split(/[.。!！?？]/);
            if (sentences.length > 2) {
              contextBuffer = sentences.slice(-2).join('. ') + '. ';
            } else {
              contextBuffer = currentChunk;
            }
          }
          
          currentChunk = '';

          // 处理累积的代码块
          for (const codeBlock of currentCodeBlocks) {
            if (codeBlock.length >= MIN_CHUNK_LENGTH) {
              yield {
                id: createDocumentId(source.name, chunkCounter++),
                content: codeBlock,
                title: `${sectionTitle || pageTitle} - Code Block`,
                url: pageUrl,
                source: source.name,
                category: 'code',
                createdAt: Date.now(),
                metadata: {
                  scraper: 'firecrawl-stream',
                  selector: source.selector,
                  sectionTitle: sectionTitle,
                  hasCodeBlock: true
                }
              };
            }
          }
          currentCodeBlocks = [];

          // 添加小延迟让事件循环有机会处理其他任务
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // 添加新段落到当前块
        if (currentChunk && processedParagraph) {
          currentChunk += '\n\n';
        }
        currentChunk += processedParagraph;
      }

      // 处理最后一个块
      if (currentChunk.length >= MIN_CHUNK_LENGTH) {
        const chunkWithContext = contextBuffer + currentChunk;
        
        yield {
          id: createDocumentId(source.name, chunkCounter++),
          content: chunkWithContext.trim(),
          title: sectionTitle || pageTitle,
          url: pageUrl,
          source: source.name,
          category: 'documentation',
          createdAt: Date.now(),
          metadata: {
            scraper: 'firecrawl-stream',
            selector: source.selector,
            sectionTitle: sectionTitle,
            hasCodeBlock: false
          }
        };
      }
      
      // 处理最后剩余的代码块
      for (const codeBlock of currentCodeBlocks) {
        if (codeBlock.length >= MIN_CHUNK_LENGTH) {
          yield {
            id: createDocumentId(source.name, chunkCounter++),
            content: codeBlock,
            title: `${sectionTitle || pageTitle} - Code Block`,
            url: pageUrl,
            source: source.name,
            category: 'code',
            createdAt: Date.now(),
            metadata: {
              scraper: 'firecrawl-stream',
              selector: source.selector,
              sectionTitle: sectionTitle,
              hasCodeBlock: true
            }
          };
        }
      }

      // 每处理完一个章节后添加延迟
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // 释放内存
    page.markdown = '';
  } catch (error) {
    logger.error(`流式处理页面 ${pageUrl} 内容时出错:`, error);
  }
}

/**
 * 使用Firecrawl流式爬取网站内容 (SDK版本)
 */
export async function scrapeWebsiteWithFirecrawl(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult> {
  logger.info(`使用Firecrawl SDK流式爬取网站: ${source.url}`);
  const startTime = Date.now();

  // 检查API密钥
  if (!FIRECRAWL_API_KEY) {
    logger.warn('未找到Firecrawl API密钥，回退到传统抓取方法');
    return await scrapeWebsiteOriginalStream(source, chunkProcessor);
  }

  // 确保API密钥格式正确
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

  let firecrawlApp: FirecrawlApp | null = null;
  let fallbackNeeded = false;
  let errorMessage = '';

  try {
    // 初始化FirecrawlApp
    firecrawlApp = new FirecrawlApp({ apiKey: apiKey });

    // 根据SDK调整爬取参数
    const crawlParams: CrawlParams = {
      excludePaths: ['/blog/.*', '/news/.*', '/tags/.*', '/authors/.*'],
      maxDepth: 3,
      scrapeOptions: {
        onlyMainContent: true,
        waitFor: 300,
        blockAds: true,
        timeout: 8000,
      }
    };

    logger.info(`开始使用 SDK crawlUrlAndWatch 流式爬取 ${source.url}`);

    return new Promise<ScrapingResult>(async (resolve, reject) => {
      try {
        const watch = await firecrawlApp!.crawlUrlAndWatch(source.url, crawlParams);

        // 创建一个批处理队列
        const batchQueue: DocumentChunk[] = [];
        const BATCH_SIZE = 5;
        let isProcessing = false;  // 添加处理状态标志

        // 处理批次的函数
        const processBatch = async (force: boolean = false) => {
          if (isProcessing) return;  // 如果正在处理，直接返回
          
          try {
            isProcessing = true;
            
            // 当 force 为 true 时，循环处理直到队列为空
            while ((batchQueue.length >= BATCH_SIZE) || (force && batchQueue.length > 0)) {
              const batchSize = force ? batchQueue.length : BATCH_SIZE;
              const batch = batchQueue.splice(0, batchSize);
              
              if (chunkProcessor) {
                try {
                  await chunkProcessor(batch);
                  stats.storedChunks = (stats.storedChunks || 0) + batch.length;
                  logger.debug(`成功处理批次，剩余队列长度: ${batchQueue.length}`);
                } catch (error) {
                  logger.error('处理文档块批次时出错:', error);
                  // 处理失败时，将数据放回队列
                  batchQueue.unshift(...batch);
                  break;  // 如果处理出错，退出循环
                }
              }

              // 手动触发垃圾回收
              if (global.gc) {
                try {
                  global.gc();
                  logger.debug("手动触发垃圾回收");
                } catch (e) {
                  // 忽略错误
                }
              }

              // 添加小延迟，让事件循环有机会处理其他任务
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } finally {
            isProcessing = false;
          }
        };

        watch.addEventListener("document", async (event) => {
          logger.info(`收到 document 事件，页面 URL: ${(event.detail as FirecrawlPage)?.url || '未知'}`);
          const page = event.detail as FirecrawlPage;
          stats.totalPages++;

          // 添加页面内容调试
          logger.debug(`页面内容长度: ${page.markdown?.length || 0} 字符`);
          if (!page.markdown) {
            logger.warn(`页面 ${page.url} 没有 markdown 内容`);
            return;  // 如果没有内容，直接返回
          }

          try {
            // 使用生成器流式处理页面内容
            for await (const chunk of streamPageContent(page, source, stats.totalChunks)) {
              logger.debug(`生成新的文档块，长度: ${chunk.content.length} 字符`);
              stats.totalChunks++;
              batchQueue.push(chunk);
              await processBatch(false);
            }

            stats.processedPages++;
            logger.info(`已处理页面 ${stats.processedPages}/${stats.totalPages}, ` +
              `总文档块: ${stats.totalChunks}, 队列中: ${batchQueue.length}`);

            // 清理页面数据
            if (page) {
              Object.keys(page).forEach(key => {
                // @ts-ignore
                page[key] = null;
              });
            }
          } catch (error) {
            logger.error(`处理页面 ${page?.url || source.url} 失败:`, error);
          }
        });

        watch.addEventListener("error", (event) => {
          const errorDetail = event.detail;
          logger.error(`Firecrawl SDK 爬取过程中发生错误:`, errorDetail);
        });

        let isDone = false;  // 添加完成状态标志

        watch.addEventListener("done", async (event) => {
          if (isDone) return;  // 防止重复处理
          isDone = true;
          
          const state = event.detail;
          logger.info(`Firecrawl SDK 爬取完成，最终状态: ${state.status}, 总页面数: ${stats.totalPages}, 已处理页面: ${stats.processedPages}`);
          stats.timeMs = Date.now() - startTime;

          // 处理最后的批次
          logger.info(`开始处理最后的批次，队列长度: ${batchQueue.length}`);
          await processBatch(true);
          logger.info(`完成处理最后的批次，剩余队列长度: ${batchQueue.length}`);

          if (batchQueue.length > 0) {
            logger.warn(`警告：队列中还有 ${batchQueue.length} 个未处理的文档块`);
          }

          if (state.status === 'completed' || (state.status === 'failed' && stats.processedPages > 0)) {
            logger.info(`完成 SDK 流式爬取网站 ${source.url}，处理了 ${stats.processedPages} 个页面，` +
              `生成 ${stats.totalChunks} 个文档块，存储 ${stats.storedChunks} 个文档块，耗时 ${stats.timeMs}ms`);
            resolve({
              success: true,
              chunks: [],
              message: `成功使用Firecrawl SDK流式爬取网站 ${source.url}，共处理 ${stats.processedPages} 个页面，生成 ${stats.totalChunks} 个文档块`,
              stats: {
                totalChunks: stats.totalChunks,
                storedChunks: stats.storedChunks,
                totalPages: stats.processedPages,
                timeMs: stats.timeMs
              }
            });
          } else {
            logger.warn(`Firecrawl SDK 爬取失败或未返回有效内容，状态: ${state.status}。回退到传统抓取方法。`);
            fallbackNeeded = true;
            errorMessage = `Firecrawl SDK 爬取失败，状态: ${state.status}`;
            checkFallbackAndResolve();
          }
        });

        // 用于处理回退的函数
        const checkFallbackAndResolve = async () => {
          if (fallbackNeeded) {
            logger.info(`执行回退到传统抓取方法...`);
            try {
              const fallbackResult = await scrapeWebsiteOriginalStream(source, chunkProcessor);
              resolve(fallbackResult);
            } catch (fallbackError) {
              logger.error(`回退到传统抓取方法时也发生错误:`, fallbackError);
              reject(wrapError(fallbackError, `原始方法和回退方法均失败: ${errorMessage}`));
            }
          }
        };

      } catch (initError) {
        logger.error(`启动 Firecrawl SDK crawlUrlAndWatch 失败:`, initError);
        fallbackNeeded = true;
        errorMessage = `启动 Firecrawl SDK crawlUrlAndWatch 失败: ${initError instanceof Error ? initError.message : String(initError)}`;
        setTimeout(async () => {
          logger.info(`执行回退到传统抓取方法...`);
          try {
            const fallbackResult = await scrapeWebsiteOriginalStream(source, chunkProcessor);
            resolve(fallbackResult);
          } catch (fallbackError) {
            logger.error(`回退到传统抓取方法时也发生错误:`, fallbackError);
            reject(wrapError(fallbackError, `原始方法和回退方法均失败: ${errorMessage}`));
          }
        }, 0);
      }
    });

  } catch (error) {
    logger.error(`使用Firecrawl SDK爬取 ${source.url} 失败 (外部捕获):`, error);
    logger.info(`回退到传统抓取方法...`);
    return await scrapeWebsiteOriginalStream(source, chunkProcessor);
  }
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
    totalPages: 1,
    processedPages: 0,
    totalChunks: 0,
    storedChunks: 0,
    timeMs: 0
  };

  let vectorStore: MastraVectorStore | null = null;
  let textBuffer = '';  // 用于累积文本
  let currentSection = '';  // 用于累积当前段落

  try {
    const axios = await getAxios();
    
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
        batchSize: 5
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

      stats.totalChunks += chunks.length;

      if (chunkProcessor) {
        await chunkProcessor(chunks);
      } else if (vectorStore) {
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

      // 手动触发垃圾回收
      if (global.gc) {
        try {
          global.gc();
          logger.debug("手动触发垃圾回收");
        } catch (e) {
          // 忽略错误
        }
      }
    };

    // 处理文本块的函数
    const processTextBlock = async () => {
      if (currentSection.length >= MIN_CHUNK_LENGTH) {
        const chunk: DocumentChunk = {
          id: createDocumentId(source.name, stats.totalChunks),
          content: currentSection.trim(),
          title: source.name || '网站文档',
          url: source.url,
          source: source.name,
          category: 'documentation',
          createdAt: Date.now(),
          metadata: {
            scraper: 'website-stream',
            index: stats.totalChunks
          }
        };

        await handleChunks([chunk]);
        await new Promise(resolve => setTimeout(resolve, 50));  // 控制处理速度
      }
      currentSection = '';  // 重置当前段落
    };

    // 配置请求
    const config: AxiosRequestConfig = {
      timeout: DEFAULT_REQUEST_TIMEOUT,
      headers: DEFAULT_HTTP_HEADERS,
      maxRedirects: MAX_REDIRECTS,
      responseType: 'stream'  // 使用流式响应
    };

    // 发送请求
    const response: AxiosResponse = await axios.get(source.url, config);

    if (response.status !== 200) {
      throw createNetworkError(`HTTP错误: ${response.status}`);
    }

    // 创建解析器
    const parser = new Parser({
      ontext: (text) => {
        const cleanText = text.trim();
        if (cleanText) {
          currentSection += ' ' + cleanText;
          
          // 如果遇到段落结束符，处理当前段落
          if (/[.。!！?？]\s*$/.test(cleanText)) {
            textBuffer += currentSection + '\n';
            if (textBuffer.length > MIN_CHUNK_LENGTH) {
              processTextBlock();
              textBuffer = '';
            }
          }
        }
      },
      onopentag: (name, attribs) => {
        // 处理特定标签
        if (['p', 'div', 'section', 'article'].includes(name)) {
          if (currentSection.length > 0) {
            textBuffer += currentSection + '\n';
            if (textBuffer.length > MIN_CHUNK_LENGTH) {
              processTextBlock();
              textBuffer = '';
            }
          }
        }
      },
      onclosetag: (tagname) => {
        // 在段落相关标签结束时处理文本
        if (['p', 'div', 'section', 'article'].includes(tagname)) {
          if (currentSection.length > 0) {
            textBuffer += currentSection + '\n';
            if (textBuffer.length > MIN_CHUNK_LENGTH) {
              processTextBlock();
              textBuffer = '';
            }
          }
        }
      }
    }, {
      decodeEntities: true
    });

    // 使用 Promise 处理流式数据
    await new Promise((resolve, reject) => {
      response.data
        .pipe(new stream.Transform({
          transform(chunk: Buffer, encoding: string, callback: Function) {
            try {
              parser.write(chunk.toString());
              callback();
            } catch (error) {
              callback(error);
            }
          }
        }))
        .on('end', async () => {
          try {
            parser.end();
            // 处理最后的文本
            if (currentSection.length > 0 || textBuffer.length > 0) {
              textBuffer += currentSection;
              await processTextBlock();
            }
            resolve(null);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });

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

    logger.info(`流式处理完成: 处理了 ${stats.totalChunks} 个文档片段，` +
      `成功存储了 ${stats.storedChunks || 0} 个文档片段，耗时 ${stats.timeMs}ms`);

    return {
      success: true,
      chunks: [],
      message: `成功使用流式处理方法抓取 ${source.url}`,
      stats: {
        totalChunks: stats.totalChunks,
        storedChunks: stats.storedChunks || 0,
        totalPages: stats.processedPages,
        timeMs: stats.timeMs
      }
    };
  } catch (error) {
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