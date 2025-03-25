/**
 * CKB生态文档处理模块 - 核心管理器
 * 
 * 整合所有文档处理功能，提供统一的API接口
 */

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
import { processLocalFile, processLocalDirectory } from '../scrapers/file';
import { chunkDocument, optimizeChunks } from '../processors/chunker';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Promise版本的文件系统API
const mkdirAsync = util.promisify(fs.mkdir);
const writeFileAsync = util.promisify(fs.writeFile);
const readFileAsync = util.promisify(fs.readFile);
const existsAsync = util.promisify(fs.exists);

// 初始化日志记录器
const logger = createLogger('DocumentManager');

/**
 * 文档管理器选项
 */
export interface DocumentManagerOptions {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 缓存目录 */
  cacheDir?: string;
  /** 自定义文档源 */
  customSources?: DocumentSource[];
  /** 是否自动优化文档块 */
  autoOptimizeChunks?: boolean;
  /** 是否在抓取完成后自动保存到缓存 */
  autoSaveToCache?: boolean;
}

/**
 * 默认文档管理器选项
 */
const DEFAULT_OPTIONS: DocumentManagerOptions = {
  enableCache: true,
  cacheDir: './cache/documents',
  customSources: [],
  autoOptimizeChunks: true,
  autoSaveToCache: true
};

/**
 * 文档管理器类
 * 
 * 提供统一的接口来获取、处理和管理CKB文档
 */
export class DocumentManager {
  private options: DocumentManagerOptions;
  private documentSources: DocumentSource[];
  private cachedChunks: Record<string, DocumentChunk[]> = {};
  private initialized: boolean = false;
  
  /**
   * 构造函数
   */
  constructor(options: DocumentManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.documentSources = [
      ...CKB_DOCUMENT_SOURCES,
      ...(this.options.customSources || [])
    ];
    
    logger.info(`文档管理器已创建，配置了 ${this.documentSources.length} 个文档源`);
  }
  
  /**
   * 初始化文档管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    logger.info('初始化文档管理器...');
    
    // 创建缓存目录（如果需要）
    if (this.options.enableCache) {
      try {
        if (!await existsAsync(this.options.cacheDir)) {
          await mkdirAsync(this.options.cacheDir, { recursive: true });
          logger.info(`创建缓存目录: ${this.options.cacheDir}`);
        }
      } catch (error) {
        logger.warn(`无法创建缓存目录: ${error.message}`);
      }
      
      // 尝试加载缓存
      await this.loadFromCache();
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
   * 获取所有文档块
   */
  getAllDocumentChunks(): DocumentChunk[] {
    const allChunks: DocumentChunk[] = [];
    
    for (const sourceChunks of Object.values(this.cachedChunks)) {
      allChunks.push(...sourceChunks);
    }
    
    return allChunks;
  }
  
  /**
   * 获取特定来源的文档块
   */
  getDocumentChunksBySource(sourceName: string): DocumentChunk[] {
    return this.cachedChunks[sourceName] || [];
  }
  
  /**
   * 根据文档源类型获取文档块
   */
  getDocumentChunksBySourceType(sourceType: 'website' | 'github' | 'file'): DocumentChunk[] {
    const result: DocumentChunk[] = [];
    
    // 找到指定类型的文档源
    const sourceNames = this.documentSources
      .filter(source => source.type === sourceType)
      .map(source => source.name);
    
    // 收集对应的文档块
    for (const name of sourceNames) {
      if (this.cachedChunks[name]) {
        result.push(...this.cachedChunks[name]);
      }
    }
    
    return result;
  }
  
  /**
   * 抓取单个文档源
   */
  async fetchSingleSource(source: DocumentSource): Promise<ScrapingResult> {
    logger.info(`开始抓取文档源: ${source.name} (${source.type})`);
    
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
      if (result.success && result.chunks.length > 0) {
        // 优化文档块
        if (this.options.autoOptimizeChunks) {
          result.chunks = optimizeChunks(result.chunks);
        }
        
        // 更新缓存
        this.cachedChunks[source.name] = result.chunks;
        
        // 保存到缓存
        if (this.options.enableCache && this.options.autoSaveToCache) {
          await this.saveToCache(source.name);
        }
        
        logger.info(`成功抓取文档源: ${source.name}，获取了 ${result.chunks.length} 个文档块`);
      } else {
        logger.warn(`抓取文档源: ${source.name} 未返回有效内容`);
      }
      
      return result;
    }, (error: DocumentProcessingError) => {
      logger.error(`抓取文档源 ${source.name} 时出错:`, error);
      return {
        success: false,
        chunks: [],
        error,
        message: `抓取文档源 ${source.name} 失败: ${error.message}`,
        stats: {
          totalChunks: 0,
          timeMs: 0
        }
      };
    });
  }
  
  /**
   * 抓取所有启用的文档源
   */
  async fetchAllSources(): Promise<ScrapingResult[]> {
    logger.info('开始抓取所有启用的文档源');
    
    const results: ScrapingResult[] = [];
    const enabledSources = this.documentSources.filter(source => source.enabled !== false);
    
    logger.info(`找到 ${enabledSources.length} 个启用的文档源`);
    
    for (const source of enabledSources) {
      try {
        const result = await this.fetchSingleSource(source);
        results.push(result);
      } catch (error) {
        logger.error(`抓取 ${source.name} 时发生错误:`, error);
        results.push({
          success: false,
          chunks: [],
          error: error instanceof Error ? error : new Error(String(error)),
          message: `抓取 ${source.name} 失败`,
          stats: {
            totalChunks: 0,
            timeMs: 0
          }
        });
      }
    }
    
    return results;
  }
  
  /**
   * 添加本地文档目录
   */
  async addLocalDirectory(directoryPath: string, sourceName: string): Promise<DocumentChunk[]> {
    logger.info(`添加本地文档目录: ${directoryPath}`);
    
    return await safeExecute(async () => {
      const chunks = await processLocalDirectory(directoryPath, sourceName);
      
      if (chunks.length > 0) {
        // 优化文档块
        if (this.options.autoOptimizeChunks) {
          const optimized = optimizeChunks(chunks);
          this.cachedChunks[sourceName] = optimized;
          
          // 保存到缓存
          if (this.options.enableCache && this.options.autoSaveToCache) {
            await this.saveToCache(sourceName);
          }
          
          return optimized;
        } else {
          this.cachedChunks[sourceName] = chunks;
          
          // 保存到缓存
          if (this.options.enableCache && this.options.autoSaveToCache) {
            await this.saveToCache(sourceName);
          }
          
          return chunks;
        }
      }
      
      return [];
    }, (error) => {
      logger.error(`处理本地目录 ${directoryPath} 时出错:`, error);
      return [];
    });
  }
  
  /**
   * 清空缓存
   */
  async clearCache(): Promise<void> {
    logger.info('清空文档缓存');
    this.cachedChunks = {};
    
    if (this.options.enableCache) {
      try {
        // 删除缓存目录内的所有文件
        if (await existsAsync(this.options.cacheDir)) {
          const files = fs.readdirSync(this.options.cacheDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              fs.unlinkSync(path.join(this.options.cacheDir, file));
            }
          }
        }
        
        logger.info('缓存目录已清空');
      } catch (error) {
        logger.warn(`清空缓存目录时出错: ${error.message}`);
      }
    }
  }
  
  /**
   * 从缓存加载文档
   */
  private async loadFromCache(): Promise<void> {
    if (!this.options.enableCache) {
      return;
    }
    
    logger.info('尝试从缓存加载文档...');
    
    try {
      if (!await existsAsync(this.options.cacheDir)) {
        logger.info('缓存目录不存在，跳过加载');
        return;
      }
      
      const files = fs.readdirSync(this.options.cacheDir);
      const cacheFiles = files.filter(file => file.endsWith('.json'));
      
      if (cacheFiles.length === 0) {
        logger.info('未找到缓存文件');
        return;
      }
      
      logger.info(`找到 ${cacheFiles.length} 个缓存文件`);
      
      for (const file of cacheFiles) {
        try {
          const filePath = path.join(this.options.cacheDir, file);
          const content = await readFileAsync(filePath, 'utf8');
          const data = JSON.parse(content);
          
          if (Array.isArray(data)) {
            const sourceName = file.replace('.json', '');
            this.cachedChunks[sourceName] = data;
            logger.info(`从缓存加载了 ${data.length} 个文档块 (来源: ${sourceName})`);
          }
        } catch (error) {
          logger.warn(`加载缓存文件 ${file} 失败: ${error.message}`);
        }
      }
    } catch (error) {
      logger.warn(`从缓存加载文档时出错: ${error.message}`);
    }
  }
  
  /**
   * 保存文档到缓存
   */
  private async saveToCache(sourceName: string): Promise<void> {
    if (!this.options.enableCache) {
      return;
    }
    
    logger.info(`将文档源 ${sourceName} 保存到缓存`);
    
    try {
      if (!await existsAsync(this.options.cacheDir)) {
        await mkdirAsync(this.options.cacheDir, { recursive: true });
      }
      
      const chunks = this.cachedChunks[sourceName];
      if (!chunks || chunks.length === 0) {
        logger.warn(`文档源 ${sourceName} 没有文档块可保存`);
        return;
      }
      
      const filePath = path.join(this.options.cacheDir, `${sourceName}.json`);
      await writeFileAsync(filePath, JSON.stringify(chunks, null, 2), 'utf8');
      
      logger.info(`成功将 ${chunks.length} 个文档块保存到 ${filePath}`);
    } catch (error) {
      logger.warn(`保存文档到缓存时出错: ${error.message}`);
    }
  }
  
  /**
   * 运行诊断
   */
  async runDiagnostics(): Promise<DiagnosticResult> {
    logger.info('运行文档系统诊断...');
    
    const allChunks = this.getAllDocumentChunks();
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
} 