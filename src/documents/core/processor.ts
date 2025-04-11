/**
 * CKB生态文档处理模块 - 文档处理协调器
 * 负责协调爬虫、向量化和存储的流式处理流程
 */

import { createLogger } from '../utils/logger.js';
import { DocumentChunk, DocumentSource, ScrapingResult } from './types.js';
import { scrapeWebsite, DocumentChunkProcessor } from '../scrapers/website.js';
import { scrapeGitHubRepo } from '../scrapers/github.js';
import { processLocalFile } from '../scrapers/file.js';
import { MastraVectorStore } from '../storage/mastra-vector-store.js';
import * as dotenv from 'dotenv';
import {
  OPENAI_API_KEY,
  PG_CONNECTION_STRING,
  PG_VECTOR_TABLE,
  PROCESSOR_BATCH_SIZE,
  PROCESSOR_INTERVAL
} from './config.js';
import { MemoryManager } from '../../utils/memory.js';

// 加载环境变量
dotenv.config();

// 初始化日志记录器
const logger = createLogger('DocumentProcessor');

/**
 * 批处理配置
 */
interface BatchProcessConfig {
  /** 批处理大小 */
  batchSize: number;
  /** 最大并发数 */
  maxConcurrent: number;
  /** 处理间隔(毫秒) */
  processingInterval: number;
}

/**
 * 文档处理协调器
 * 负责协调文档爬取、向量化和存储的整个流程
 */
export class DocumentProcessor {
  private vectorStore: MastraVectorStore;
  private batchConfig: BatchProcessConfig;
  private memoryManager: MemoryManager;

  // 处理统计信息
  private totalDocuments: number = 0;
  private totalVectorized: number = 0;
  private failedDocuments: number = 0;

  // 当前批处理队列
  private currentBatch: DocumentChunk[] = [];
  private isProcessingBatch: boolean = false;

  /**
   * 构造函数
   * @param config 批处理配置
   */
  constructor(config: {
    batchSize?: number;
    processingInterval?: number;
    maxConcurrent?: number;
  } = {}) {
    // 初始化向量存储
    this.vectorStore = new MastraVectorStore({
      apiKey: OPENAI_API_KEY,
      pgConnectionString: PG_CONNECTION_STRING,
      tablePrefix: PG_VECTOR_TABLE,
      batchSize: 10  // 减小批次大小以减轻内存压力
    });

    // 默认配置，可被传入的配置覆盖
    this.batchConfig = {
      batchSize: config.batchSize || PROCESSOR_BATCH_SIZE,
      maxConcurrent: config.maxConcurrent || 1,
      processingInterval: config.processingInterval || PROCESSOR_INTERVAL
    };

    // 初始化内存管理器
    this.memoryManager = MemoryManager.getInstance();

    logger.info(`文档处理协调器初始化完成，批处理大小: ${this.batchConfig.batchSize}, 处理间隔: ${this.batchConfig.processingInterval}ms`);
  }

  /**
   * 初始化向量存储
   */
  public async initialize(): Promise<boolean> {
    logger.info("初始化文档处理器的向量存储...");
    return await this.vectorStore.initialize();
  }

  /**
   * 流式处理文档源
   * 使用更合适的批处理和内存管理策略
   * @param sourceConfig 文档源配置
   */
  async streamProcessDocumentSource(sourceConfig: {
    type: 'github' | 'website' | 'file';
    source: {
      url: string;
      name: string;
    }
  }): Promise<ScrapingResult> {
    const { type, source } = sourceConfig;

    logger.info(`开始流式处理文档源: ${source.name} (${type})`);
    this.memoryManager.checkMemory('开始处理前');

    // 重置处理统计
    this.resetStats();

    try {
      // 确保向量存储已初始化
      await this.ensureVectorStoreInitialized();

      // 创建文档块处理器回调
      const chunkProcessor: DocumentChunkProcessor = async (chunks) => {
        await this.handleDocumentChunks(chunks);
      };

      // 根据源类型选择不同的处理方法
      let result: ScrapingResult;

      const startTime = Date.now();

      switch (type) {
        case 'website':
          // 使用流式网站爬虫
          result = await scrapeWebsite({
            type: 'website',
            url: source.url,
            name: source.name,
            enabled: true
          }, chunkProcessor);
          break;

        case 'github':
          // 使用流式GitHub仓库爬虫
          result = await scrapeGitHubRepo({
            type: 'github',
            url: source.url,
            name: source.name,
            enabled: true
          });
          break;

        case 'file':
          // 处理本地文件
          result = await processLocalFile({
            type: 'file',
            url: source.url,
            name: source.name,
            enabled: true
          });
          break;

        default:
          throw new Error(`不支持的文档源类型: ${type}`);
      }

      // 确保所有剩余的批次都被处理
      await this.processRemainingBatch();

      const endTime = Date.now();

      // 更新处理统计
      if (result.stats) {
        result.stats.totalChunks = this.totalDocuments;
        result.stats.storedChunks = this.totalVectorized;
        result.stats.timeMs = endTime - startTime;
      }

      // 检查最终内存使用
      this.memoryManager.checkMemory('处理完成后');

      logger.info(`文档源处理完成: ${source.name}, 总文档块: ${this.totalDocuments}, ` +
        `向量化: ${this.totalVectorized}, 失败: ${this.failedDocuments}, ` +
        `耗时: ${(endTime - startTime) / 1000}秒`);

      return result;
    } catch (error) {
      logger.error(`处理文档源失败: ${source.name}`, error);

      // 检查错误后的内存使用
      this.memoryManager.checkMemory('处理失败后');

      return {
        success: false,
        chunks: [],
        error: error instanceof Error ? error : new Error(String(error)),
        message: `处理文档源失败: ${error}`,
        stats: {
          totalChunks: this.totalDocuments,
          storedChunks: this.totalVectorized,
          timeMs: 0
        }
      };
    } finally {
      // 尝试关闭向量存储连接
      try {
        await this.vectorStore.close();
      } catch (e) {
        logger.warn("关闭向量存储时出错:", e);
      }
      
      // 尝试进行最终垃圾回收
      this.memoryManager.tryGC(true);
    }
  }

  /**
   * 处理文档块
   * 将文档块添加到当前批次，并在达到批次大小时处理
   */
  private async handleDocumentChunks(chunks: DocumentChunk[]): Promise<void> {
    if (!chunks || chunks.length === 0) return;

    // 记录处理前的内存使用
    if (this.totalDocuments % 100 === 0) {
      this.memoryManager.checkMemory(`处理${this.totalDocuments}个文档块后`);
    }

    logger.info(`收到${chunks.length}个新文档块，当前批次大小: ${this.currentBatch.length}, ` +
      `已处理总数: ${this.totalDocuments}`);

    // 添加文档块到批次
    this.currentBatch.push(...chunks);
    this.totalDocuments += chunks.length;

    // 记录文档块示例信息（仅用于调试）
    if (chunks.length > 0) {
      const sampleChunk = chunks[0];
      logger.debug(`文档块示例: id=${sampleChunk.id}, 内容长度=${sampleChunk.content.length}, ` +
        `类型=${sampleChunk.metadata?.type}, 来源=${sampleChunk.metadata?.source}`);
    }

    // 在达到批次大小时处理
    if (this.currentBatch.length >= this.batchConfig.batchSize) {
      logger.info(`批次已达到处理阈值 (${this.batchConfig.batchSize})，开始处理批次...`);
      await this.processBatch();
    }
  }

  /**
   * 处理当前批次
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessingBatch || this.currentBatch.length === 0) {
      return;
    }

    this.isProcessingBatch = true;
    const batchToProcess = [...this.currentBatch];
    this.currentBatch = [];

    try {
      const startTime = Date.now();
      logger.info(`开始处理批次，包含 ${batchToProcess.length} 个文档块...`);

      // 记录处理前的内存使用
      this.memoryManager.checkMemory('批次处理前');

      // 向量化并存储批次
      const storedCount = await this.vectorStore.storeDocuments(batchToProcess);
      this.totalVectorized += storedCount;
      this.failedDocuments += (batchToProcess.length - storedCount);

      const endTime = Date.now();
      logger.info(`批次处理完成，成功向量化并存储 ${storedCount}/${batchToProcess.length} 个文档块, ` +
        `耗时: ${endTime - startTime}ms`);

      // 记录处理后的内存使用
      this.memoryManager.checkMemory('批次处理后');

      // 尝试释放内存
      batchToProcess.length = 0;
      this.memoryManager.tryGC();

      // 在处理之间添加延迟，减少内存压力
      if (this.batchConfig.processingInterval > 0) {
        logger.debug(`等待 ${this.batchConfig.processingInterval}ms 后处理下一批次...`);
        await new Promise(resolve => setTimeout(resolve, this.batchConfig.processingInterval));
      }
    } catch (error) {
      logger.error('处理批次时出错:', error);
      this.failedDocuments += batchToProcess.length;
    } finally {
      // 确保资源被释放
      batchToProcess.length = 0;
      this.isProcessingBatch = false;
    }
  }

  /**
   * 处理剩余的所有文档块
   */
  private async processRemainingBatch(): Promise<void> {
    if (this.currentBatch.length > 0) {
      logger.info(`处理剩余的 ${this.currentBatch.length} 个文档块`);
      await this.processBatch();

      // 递归处理，直到全部处理完
      if (this.currentBatch.length > 0) {
        await this.processRemainingBatch();
      }
    }
  }

  /**
   * 重置处理统计
   */
  private resetStats(): void {
    this.totalDocuments = 0;
    this.totalVectorized = 0;
    this.failedDocuments = 0;
    this.currentBatch = [];
    this.isProcessingBatch = false;
  }

  /**
   * 确保向量存储已初始化
   * 如果未初始化，尝试初始化它
   */
  private async ensureVectorStoreInitialized(): Promise<void> {
    if (!this.vectorStore) {
      logger.error("向量存储未创建");
      throw new Error("向量存储未创建");
    }

    try {
      // 调用 initialize 方法进行初始化
      if (!(await this.vectorStore.initialize())) {
        throw new Error("向量存储初始化失败");
      }
    } catch (error) {
      logger.error("向量存储初始化失败:", error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.vectorStore.close();
  }
}

// 注意：这里不再默认导出处理器实例，因为它需要配置

/**
 * 处理单个文档源的便捷函数
 */
export async function processDocumentSource(
  source: DocumentSource,
  config: {
    batchSize?: number;
    processingInterval?: number;
    maxConcurrent?: number;
  } = {}
): Promise<ScrapingResult> {
  const processor = new DocumentProcessor(config);
  await processor.initialize();
  return processor.streamProcessDocumentSource({
    type: source.type,
    source: {
      url: source.url,
      name: source.name
    }
  });
}

/**
 * 批量处理文档源的便捷函数
 */
export async function processDocumentSources(
  sources: DocumentSource[],
  config: {
    batchSize?: number;
    processingInterval?: number;
    maxConcurrent?: number;
  } = {}
): Promise<{
  total: number;
  successful: number;
  failed: number;
  totalChunks: number;
  storedChunks: number;
}> {
  const processor = new DocumentProcessor(config);
  await processor.initialize();
  let successful = 0;
  let failed = 0;
  let totalChunks = 0;
  let storedChunks = 0;

  for (const source of sources) {
    if (!source.enabled) {
      logger.info(`跳过已禁用的文档源: ${source.name}`);
      continue;
    }

    try {
      const result = await processor.streamProcessDocumentSource({
        type: source.type,
        source: {
          url: source.url,
          name: source.name
        }
      });
      if (result.success) {
        successful++;
        totalChunks += result.stats?.totalChunks || 0;
        storedChunks += result.stats?.storedChunks || 0;
      } else {
        failed++;
      }
    } catch (error) {
      logger.error(`处理文档源出错: ${source.name}`, error);
      failed++;
    }

    // 处理完一个源后等待一小段时间，避免系统负载过高
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 尝试关闭向量存储连接
  try {
    await processor.close();
  } catch (e) {
    logger.warn("关闭向量存储时出错:", e);
  }
  
  logger.info(`批量处理完成，成功: ${successful}, 失败: ${failed}, ` +
    `总文档块: ${totalChunks}，成功存储: ${storedChunks}`);

  return {
    total: sources.length,
    successful,
    failed,
    totalChunks,
    storedChunks
  };
} 