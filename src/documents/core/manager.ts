/**
 * CKB生态文档处理模块 - 核心管理器
 *
 * 整合所有文档处理功能，提供统一的API接口
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocumentChunk, DocumentSource, ScrapingResult, DiagnosticResult } from './types';
import { CKB_DOCUMENT_SOURCES } from './config';
import { createLogger } from '../utils/logger';
import {
  DocumentProcessingError,
  ErrorType,
  handleError,
  safeExecute
} from '../utils/errors';
import * as util from 'util';
import { MastraVectorStore } from '../storage/mastra-vector-store';
import {
  OPENAI_API_KEY,
  PG_CONNECTION_STRING,
  PG_VECTOR_TABLE,
  PROCESSOR_BATCH_SIZE, // Import processor config if needed for processDocumentSource
  PROCESSOR_INTERVAL
} from './config';
import { processDocumentSource } from './processor.js'; // Corrected import

// Promise版本的文件系统API
const existsAsync = util.promisify(fs.exists);

// 初始化日志记录器
const logger = createLogger('DocumentManager');

/**
 * 文档管理器选项
 */
export interface DocumentManagerOptions {
  /** 是否强制刷新文档（重新抓取） */
  forceRefreshDocs?: boolean;
  /** 自定义文档源 */
  customSources?: DocumentSource[];
  // autoOptimizeChunks might be handled by processor now, review if needed
  // autoOptimizeChunks?: boolean;
  /** 自定义向量存储配置 */
  vectorStoreConfig?: {
    apiKey?: string;
    pgConnectionString?: string;
    tablePrefix?: string;
    batchSize?: number; // Note: Processor might use its own batch size
  };
  /** Processor 配置 */
  processorConfig?: {
    batchSize?: number;
    processingInterval?: number;
    maxConcurrent?: number;
  }
}

/**
 * 默认文档管理器选项
 */
const DEFAULT_OPTIONS: DocumentManagerOptions = {
  forceRefreshDocs: false,
  customSources: [],
  // autoOptimizeChunks: true // Handled by processor
};

/**
 * 文档管理器类
 *
 * 提供统一的接口来获取、处理和管理CKB文档
 */
export class DocumentManager {
  private options: DocumentManagerOptions;
  private documentSources: DocumentSource[];
  private vectorStore: MastraVectorStore;
  private initialized: boolean = false;
  private processedSources: Set<string> = new Set();

  /**
   * 构造函数
   */
  constructor(options: DocumentManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.documentSources = [
      ...CKB_DOCUMENT_SOURCES,
      ...(this.options.customSources || [])
    ];

    // Initialize vector store for querying purposes
    this.vectorStore = new MastraVectorStore({
      apiKey: this.options.vectorStoreConfig?.apiKey || OPENAI_API_KEY,
      pgConnectionString: this.options.vectorStoreConfig?.pgConnectionString || PG_CONNECTION_STRING,
      tablePrefix: this.options.vectorStoreConfig?.tablePrefix || PG_VECTOR_TABLE,
      batchSize: this.options.vectorStoreConfig?.batchSize || 10 // Used for querying? Or remove if only processor stores
    });

    logger.info(`文档管理器已创建，配置了 ${this.documentSources.length} 个文档源，强制刷新模式: ${this.options.forceRefreshDocs}`);
  }

  /**
   * 初始化文档管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('初始化文档管理器...');

    const success = await this.vectorStore.initialize();
    if (!success) {
      throw new Error('初始化管理器向量存储失败');
    }

    this.initialized = true;
    logger.info('文档管理器初始化完成');
  }

  /**
   * 获取所有文档源
   */
  getDocumentSources(): DocumentSource[] {
    return this.documentSources;
  }

  /**
   * 添加自定义文档源
   */
  addDocumentSource(source: DocumentSource): void {
    this.documentSources.push(source);
    logger.info(`添加了新的文档源: ${source.name}`);
  }

  /**
   * 清除文档缓存
   * 清除内存中的临时文档块和向量存储中的所有文档
   */
  async clearCache(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info('开始清除所有文档缓存...');

    // Clear processed sources flag
    this.processedSources.clear();
    logger.info('成功清除已处理源标记');

    // Attempt to clear the vector store
    try {
      // Assuming '*' deletes all. Adjust if API is different.
      const deleteResult = await this.vectorStore.deleteDocuments(['*']);

      if (deleteResult >= 0) { // Check if deletion reported success (count >= 0)
        logger.info(`成功清除向量存储中的 ${deleteResult} 个文档 (或所有文档)`);
        // Optionally re-initialize if needed, though deleteDocuments might suffice
        // await this.vectorStore.initialize();
        return true;
      } else {
        logger.warn('向量存储清除操作完成，但无法确认是否成功删除所有文档 (或无文档删除)');
        return false; // Indicate potential issue
      }
    } catch (error) {
      logger.error('清除向量存储中的文档时出错:', error);
      return false;
    }
  }

  /**
   * 获取并处理单个文档源 (Refactored to use processDocumentSource)
   * @param sourceOrUrl 文档源对象或其URL
   * @param options 抓取选项
   * @returns 抓取结果
   */
  async fetchSingleSource(
    sourceOrUrl: DocumentSource | string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<ScrapingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Find the source if URL is provided
    let source: DocumentSource | undefined;
    if (typeof sourceOrUrl === 'string') {
      source = this.documentSources.find(s => s.url === sourceOrUrl);
      if (!source) {
        const errorMsg = `找不到具有指定URL的文档源: ${sourceOrUrl}`;
        logger.error(errorMsg);
        return { success: false, chunks: [], message: errorMsg, error: new DocumentProcessingError(errorMsg, { type: ErrorType.CONFIGURATION_ERROR }) };
      }
    } else {
      source = sourceOrUrl;
    }

    const forceRefresh = options.forceRefresh ?? this.options.forceRefreshDocs;

    // Check if already processed (unless forceRefresh is true)
    if (this.processedSources.has(source.name) && !forceRefresh) {
      logger.info(`文档源 ${source.name} 已处理过，跳过。`);
      // Return a success state indicating skip, stats might be unavailable or 0
      return {
        success: true,
        chunks: [], // No chunks returned directly by manager now
        message: `文档源 ${source.name} 已处理过，跳过。`,
        stats: { totalChunks: 0, storedChunks: 0, timeMs: 0 } // Placeholder stats
      };
    }

    logger.info(`开始处理文档源: ${source.name} (${source.type}), 强制刷新: ${forceRefresh}`);

    // Delegate processing to processDocumentSource
    return await safeExecute(async () => {
      // Pass processor config from manager options if available
      const processorConfig = this.options.processorConfig || {};

      // Call the centralized processor function
      const result = await processDocumentSource(source, processorConfig);

      if (result.success) {
        this.processedSources.add(source.name); // Mark as processed
        logger.info(`成功处理文档源: ${source.name}. 块信息: ${JSON.stringify(result.stats)}`);
      } else {
        logger.error(`处理文档源 ${source.name} 失败: ${result.message}`, result.error);
        throw result.error || new DocumentProcessingError(result.message || `处理 ${source.name} 失败`, { type: ErrorType.PROCESSING_FAILED });
      }
      return result; // Return the result from processDocumentSource
    });
  }


  /**
   * 抓取所有文档源
   * @param options 抓取选项
   * @returns 抓取结果数组
   */
  async fetchAllSources(
    options: { forceRefresh?: boolean } = {}
  ): Promise<ScrapingResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const forceRefresh = options.forceRefresh ?? this.options.forceRefreshDocs;
    logger.info(`开始处理所有文档源，共 ${this.documentSources.length} 个，强制刷新: ${forceRefresh}`);

    const results: ScrapingResult[] = [];

    // Iterate and call the updated fetchSingleSource
    for (const source of this.documentSources) {
      if (!source.enabled) {
        logger.info(`跳过已禁用的文档源: ${source.name}`);
        // Optionally add a skipped result
        results.push({ success: true, chunks: [], message: `Skipped disabled source: ${source.name}` });
        continue;
      }
      // No need for try-catch here if fetchSingleSource uses safeExecute
      const result = await this.fetchSingleSource(source, { forceRefresh });
      results.push(result);

      // Optional delay between sources
      await new Promise(resolve => setTimeout(resolve, 1000)); // Shorter delay maybe
    }

    logger.info(`完成处理所有文档源，结果数: ${results.length}`);
    // Log summary stats maybe?
    const successfulCount = results.filter(r => r.success && !r.message?.includes('跳过')).length;
    const skippedCount = results.filter(r => r.success && r.message?.includes('跳过')).length;
    const failedCount = results.filter(r => !r.success).length;
    logger.info(`处理总结: 成功=${successfulCount}, 失败=${failedCount}, 跳过=${skippedCount}`);


    return results;
  }

  /**
   * 查询文档
   * @param query 查询文本
   * @param options 查询选项
   */
  async queryDocuments(
    query: string,
    options: {
      maxResults?: number;
      similarityThreshold?: number;
      filter?: Record<string, any>;
    } = {}
  ): Promise<Array<{ document: DocumentChunk, score: number }>> {
    if (!this.initialized) {
      // Ensure initialized specifically for querying
      await this.initialize();
    }
    // Uses the manager's vectorStore instance
    return this.vectorStore.queryByText(query, {
      maxResults: options.maxResults,
      similarityThreshold: options.similarityThreshold,
      filter: options.filter
    });
  }

  /**
   * 运行诊断 (Needs update as manager no longer holds chunks directly)
   */
  async runDiagnostics(): Promise<DiagnosticResult> {
    logger.info('运行文档系统诊断...');
    if (!this.initialized) {
      await this.initialize();
    }

    // Diagnostics now needs to potentially query the vector store
    // or rely on stats returned by the processor, which are not persisted here.
    // This implementation needs significant rework.
    // For now, return a basic status check.

    let status: 'ok' | 'warning' | 'error' = 'warning'; // Default to warning as stats are unavailable
    let message = '诊断功能需要更新以反映处理流程的变化。无法提供详细统计信息。';
    let issues: string[] = ['诊断统计信息不可用'];
    let totalChunks = 0;
    try {
      // Basic check: Can we connect to the vector store?
      // Attempt a simple query or check connection status if available
      const testQuery = await this.vectorStore.queryByText('test query', { maxResults: 1 });
      status = 'ok';
      message = '向量存储连接正常。诊断统计需要更新。';
      issues = [];

      // 获取文档块总数
      totalChunks = await this.vectorStore.getTotalDocuments();

    } catch (error) {
      status = 'error';
      message = `诊断失败：无法连接或查询向量存储。 ${error.message}`;
      issues.push(`无法访问向量存储: ${error.message}`);
    }


    return {
      status,
      message,
      stats: { // Return empty/placeholder stats
        total: totalChunks,
        bySource: {},
        byCategory: {}
      }
    };
  }


  /**
   * 添加本地目录
   * @param dirPath 本地目录路径
   * @param namePrefix 文档名称前缀
   * @param recursive 是否递归处理子目录
   * @returns 处理结果数组
   */
  async addLocalDirectory(
    dirPath: string,
    namePrefix: string = '本地文档',
    recursive: boolean = true
  ): Promise<ScrapingResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info(`扫描本地目录: ${dirPath}`);

    if (!await existsAsync(dirPath)) {
      logger.error(`目录不存在: ${dirPath}`);
      return [];
    }

    const results: ScrapingResult[] = [];
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && recursive) {
        const subDirResults = await this.addLocalDirectory(
          filePath,
          `${namePrefix}/${file}`,
          recursive
        );
        results.push(...subDirResults);
      } else if (stat.isFile()) {
        const fileExt = path.extname(file).toLowerCase();
        let fileType: 'text' | 'markdown' | 'pdf' | undefined;

        if (['.md', '.markdown'].includes(fileExt)) fileType = 'markdown';
        else if (fileExt === '.pdf') fileType = 'pdf';
        else if (['.txt', '.js', '.py', '.ts', '.html', '.css', '.json', '.yml', '.yaml'].includes(fileExt)) fileType = 'text';
        else {
          logger.warn(`跳过不支持的文件类型: ${filePath}`);
          continue;
        }

        const source: DocumentSource = {
          name: `${namePrefix}/${file}`,
          type: 'file',
          url: `file://${filePath}`, // Standardize URL representation
          filePath: filePath,
          fileType: fileType,
          enabled: true
        };

        // Check if source already exists? Optional.
        // this.addDocumentSource(source); // Don't add here, let fetchSingleSource handle it if needed? Or add but handle duplicates.

        logger.info(`找到文件源: ${source.name}`);
        const result = await this.fetchSingleSource(source); // Process the discovered file source
        results.push(result);
      }
    }
    logger.info(`本地目录扫描完成: ${dirPath}, 处理了 ${results.length} 个文件/子目录结果`);
    return results;
  }


  /**
   * 关闭资源
   */
  async close(): Promise<void> {
    // Close the manager's vector store connection
    await this.vectorStore.close();
    logger.info('管理器向量存储连接已关闭');
  }
}