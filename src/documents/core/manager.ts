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
  createConfigurationError, 
  DocumentProcessingError, 
  ErrorType, 
  handleError, 
  safeExecute 
} from '../utils/errors';
import { generateId } from '../utils/helpers';
import { scrapeWebsite } from '../scrapers/website';
import { scrapeGitHubRepo } from '../scrapers/github';
import { processLocalFile } from '../scrapers/file';
import { chunkDocument, optimizeChunks } from '../processors/chunker';
import * as util from 'util';
import { MastraVectorStore } from '../storage/mastra-vector-store';
import { 
  OPENAI_API_KEY, 
  PG_CONNECTION_STRING, 
  PG_VECTOR_TABLE 
} from './config';

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
  /** 是否自动优化文档块 */
  autoOptimizeChunks?: boolean;
  /** 自定义向量存储配置 */
  vectorStoreConfig?: {
    apiKey?: string;
    pgConnectionString?: string;
    tablePrefix?: string;
    batchSize?: number;
  };
}

/**
 * 默认文档管理器选项
 */
const DEFAULT_OPTIONS: DocumentManagerOptions = {
  forceRefreshDocs: false,
  customSources: [],
  autoOptimizeChunks: true
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
  private tempChunks: Record<string, DocumentChunk[]> = {};
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
    
    // 初始化向量存储
    this.vectorStore = new MastraVectorStore({
      apiKey: this.options.vectorStoreConfig?.apiKey || OPENAI_API_KEY,
      pgConnectionString: this.options.vectorStoreConfig?.pgConnectionString || PG_CONNECTION_STRING,
      tablePrefix: this.options.vectorStoreConfig?.tablePrefix || PG_VECTOR_TABLE,
      batchSize: this.options.vectorStoreConfig?.batchSize || 10
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
    
    // 初始化向量存储
    const success = await this.vectorStore.initialize();
    if (!success) {
      throw new Error('初始化向量存储失败');
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
   * 获取特定来源的文档块
   * 注意：此方法仅返回内存中的临时文档块，不会查询向量数据库
   */
  getDocumentChunksBySource(sourceName: string): DocumentChunk[] {
    return this.tempChunks[sourceName] || [];
  }
  
  /**
   * 获取所有文档块
   * 注意：此方法仅返回内存中的临时文档块，不会查询向量数据库
   */
  getAllDocumentChunks(): DocumentChunk[] {
    let allChunks: DocumentChunk[] = [];
    Object.values(this.tempChunks).forEach(chunks => {
      allChunks = allChunks.concat(chunks);
    });
    return allChunks;
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
    
    // 先清除内存中的临时缓存
    this.tempChunks = {};
    this.processedSources.clear();
    logger.info('成功清除内存缓存');
    
    // 尝试清除向量存储中的所有文档
    try {
      // 清除向量存储中的所有文档
      const deleteResult = await this.vectorStore.deleteDocuments(['*']);
      
      if (deleteResult > 0) {
        logger.info('成功清除向量存储中的所有文档');
        return true;
      } else {
        logger.warn('向量存储清除操作完成，但无法确认是否成功删除所有文档');
        
        // 尝试重新初始化向量存储
        try {
          // 关闭现有连接
          await this.vectorStore.close();
          
          // 重新初始化
          const success = await this.vectorStore.initialize();
          if (success) {
            logger.info('成功重新初始化向量存储');
            return true;
          }
        } catch (reinitError) {
          logger.error('重新初始化向量存储失败:', reinitError);
        }
        
        return false;
      }
    } catch (error) {
      logger.error('清除向量存储中的文档时出错:', error);
      
      // 即使清除向量存储失败，我们也已经清除了内存缓存
      logger.warn('注意：虽然向量存储清除失败，但内存缓存已经清除');
      
      return false;
    }
  }
  
  /**
   * 抓取单个文档源
   * @param source 文档源
   * @param options 抓取选项
   * @returns 抓取结果
   */
  async fetchSingleSource(
    source: DocumentSource, 
    options: { forceRefresh?: boolean } = {}
  ): Promise<ScrapingResult> {
    const forceRefresh = options.forceRefresh ?? this.options.forceRefreshDocs;
    
    logger.info(`开始抓取文档源: ${source.name} (${source.type}), 强制刷新: ${forceRefresh}`);
    
    // 如果已处理过且不需要强制刷新，则跳过
    if (this.processedSources.has(source.name) && !forceRefresh) {
      logger.info(`文档源 ${source.name} 已处理过，跳过抓取`);
      return {
        success: true,
        chunks: this.tempChunks[source.name] || [],
        message: `文档源 ${source.name} 已处理过，使用现有数据`,
        stats: {
          totalChunks: this.tempChunks[source.name]?.length || 0,
          storedChunks: this.tempChunks[source.name]?.length || 0,
          timeMs: 0
        }
      };
    }
    
    return await safeExecute(async () => {
      let result: ScrapingResult;
      
      // 根据文档源类型调用不同的抓取器
      switch (source.type) {
        case 'website':
          result = await scrapeWebsite(source);
          break;
        case 'github':
          result = await scrapeGitHubRepo(source);
          break;
        case 'file':
          result = await processLocalFile(source);
          break;
        default:
          throw createConfigurationError(`不支持的文档源类型: ${source.type}`);
      }
      
      // 处理抓取结果
      if (result.success && result.chunks && result.chunks.length > 0) {
        // 优化文档块
        if (this.options.autoOptimizeChunks) {
          result.chunks = optimizeChunks(result.chunks);
        }
        
        // 临时保存文档块
        this.tempChunks[source.name] = result.chunks;
        
        // 向量化并存储到数据库
        const startTime = Date.now();
        logger.info(`开始向量化并存储 ${result.chunks.length} 个文档块...`);
        const storedCount = await this.vectorStore.storeDocuments(result.chunks);
        const endTime = Date.now();
        
        logger.info(`向量化完成，成功存储 ${storedCount}/${result.chunks.length} 个文档块，耗时: ${(endTime - startTime)/1000}秒`);
        
        // 更新统计信息
        if (result.stats) {
          result.stats.storedChunks = storedCount;
        }
        
        // 记录已处理的源
        this.processedSources.add(source.name);
        
        logger.info(`成功抓取 ${source.name}，获取 ${result.chunks.length} 个文档块`);
      } else {
        logger.warn(`抓取文档源: ${source.name} 未返回有效内容`);
      }
      
      return result;
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
    logger.info(`开始抓取所有文档源，共 ${this.documentSources.length} 个，强制刷新: ${forceRefresh}`);
    
    const results: ScrapingResult[] = [];
    
    // 逐个抓取文档源
    for (const source of this.documentSources) {
      try {
        const result = await this.fetchSingleSource(source, { forceRefresh });
        results.push(result);
      } catch (error) {
        logger.error(`抓取 ${source.name} 失败:`, error);
        
        // 构造失败结果
        results.push({
          success: false,
          chunks: [],
          error: error instanceof DocumentProcessingError ? error : 
            new DocumentProcessingError(`抓取 ${source.name} 失败: ${error.message}`, {
              type: ErrorType.INTERNAL_ERROR,
              cause: error
            }),
          message: `抓取 ${source.name} 失败: ${error.message}`
        });
      }
    }
    
    logger.info(`完成抓取所有文档源，成功率: ${results.filter(r => r.success).length}/${results.length}`);
    
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
  ): Promise<Array<{document: DocumentChunk, score: number}>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.vectorStore.queryByText(query, {
      maxResults: options.maxResults,
      similarityThreshold: options.similarityThreshold,
      filter: options.filter
    });
  }
  
  /**
   * 运行诊断
   */
  async runDiagnostics(): Promise<DiagnosticResult> {
    logger.info('运行文档系统诊断...');
    
    // 收集所有临时文档块
    const allChunks: DocumentChunk[] = [];
    for (const chunks of Object.values(this.tempChunks)) {
      allChunks.push(...chunks);
    }
    
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    
    // 统计信息
    allChunks.forEach(chunk => {
      // 按来源统计
      bySource[chunk.source] = (bySource[chunk.source] || 0) + 1;
      
      // 按分类统计
      byCategory[chunk.category] = (byCategory[chunk.category] || 0) + 1;
    });
    
    // 检查问题
    const issues: string[] = [];
    
    // 检查空文档源
    for (const source of this.documentSources) {
      if (!bySource[source.name] || bySource[source.name] === 0) {
        issues.push(`文档源 "${source.name}" 没有文档块`);
      }
    }
    
    // 检查文档块质量
    const lowQualityChunks = allChunks.filter(chunk => chunk.content.length < 100);
    if (lowQualityChunks.length > 0) {
      issues.push(`发现 ${lowQualityChunks.length} 个低质量文档块（内容少于100个字符）`);
    }
    
    // 确定状态
    let status: 'ok' | 'warning' | 'error' = 'ok';
    if (issues.length > 0) {
      status = issues.length > 3 ? 'error' : 'warning';
    }
    
    // 生成诊断消息
    const message = issues.length > 0
      ? `发现 ${issues.length} 个问题：${issues.join('; ')}`
      : `文档系统运行正常，共有 ${allChunks.length} 个文档块，来自 ${Object.keys(bySource).length} 个来源`;
    
    return {
      status,
      message,
      stats: {
        total: allChunks.length,
        bySource,
        byCategory
      }
    };
  }
  
  /**
   * 添加本地目录
   * @param dirPath 本地目录路径
   * @param namePrefix 文档名称前缀
   * @param recursive 是否递归处理子目录
   * @returns 处理的文档块数组
   */
  async addLocalDirectory(
    dirPath: string,
    namePrefix: string = '本地文档',
    recursive: boolean = true
  ): Promise<DocumentChunk[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    logger.info(`添加本地目录: ${dirPath}`);
    
    // 检查目录是否存在
    if (!fs.existsSync(dirPath)) {
      logger.error(`目录不存在: ${dirPath}`);
      return [];
    }
    
    // 处理的文档块
    let processedChunks: DocumentChunk[] = [];
    
    // 读取目录内容
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      // 如果是目录且允许递归
      if (stat.isDirectory() && recursive) {
        // 递归处理子目录
        const subDirChunks = await this.addLocalDirectory(
          filePath,
          `${namePrefix}/${file}`,
          recursive
        );
        processedChunks.push(...subDirChunks);
      }
      // 如果是文件
      else if (stat.isFile()) {
        // 创建文档源
        const fileExt = path.extname(file).toLowerCase();
        let fileType: 'text' | 'markdown' | 'pdf' | undefined;
        
        // 根据文件扩展名确定类型
        if (['.md', '.markdown'].includes(fileExt)) {
          fileType = 'markdown';
        } else if (fileExt === '.pdf') {
          fileType = 'pdf';
        } else if (['.txt', '.js', '.py', '.ts', '.html', '.css', '.json', '.yml', '.yaml'].includes(fileExt)) {
          fileType = 'text';
        } else {
          // 跳过不支持的文件类型
          logger.warn(`跳过不支持的文件类型: ${filePath}`);
          continue;
        }
        
        const source: DocumentSource = {
          name: `${namePrefix}/${file}`,
          type: 'file',
          url: `file://${filePath}`,
          filePath: filePath,
          fileType: fileType,
          enabled: true
        };
        
        // 添加文档源
        this.addDocumentSource(source);
        
        try {
          // 处理文件
          const result = await this.fetchSingleSource(source);
          
          if (result.success && result.chunks) {
            logger.info(`成功处理文件 ${filePath}, 获取了 ${result.chunks.length} 个文档块`);
            processedChunks.push(...result.chunks);
          } else {
            logger.warn(`处理文件 ${filePath} 失败: ${result.message}`);
          }
        } catch (error) {
          logger.error(`处理文件 ${filePath} 时出错:`, error);
        }
      }
    }
    
    logger.info(`本地目录处理完成: ${dirPath}, 获取了 ${processedChunks.length} 个文档块`);
    return processedChunks;
  }
  
  /**
   * 关闭资源
   */
  async close(): Promise<void> {
    await this.vectorStore.close();
    logger.info('向量存储连接已关闭');
  }
} 