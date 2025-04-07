// @ts-nocheck
/**
 * CKB生态文档处理模块 - Mastra向量存储
 * 
 * 基于Mastra框架的PgVector实现向量存储功能
 */

import { createLogger } from '../utils/logger.js';
import { DocumentChunk } from '../core/types.js';
import { safeExecute, createConfigurationError } from '../utils/errors.js';
import * as dotenv from 'dotenv';
import { PgVector } from '@mastra/pg';
import { generateId } from '../utils/helpers.js';
import { openai } from '@ai-sdk/openai';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { MemoryManager } from '../../utils/memory.js';
// 导入配置和Mastra实例
import { 
  OPENAI_API_KEY, 
  OPENAI_EMBEDDING_MODEL, 
  PG_CONNECTION_STRING, 
  PG_VECTOR_TABLE 
} from '../core/config.js';
import { mastra } from '../../mastra/index.js';

// 加载环境变量
dotenv.config();

// 初始化日志记录器
const logger = createLogger('MastraVectorStore');

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  /** OpenAI API密钥 */
  apiKey?: string;
  /** 嵌入模型名称 */
  embeddingModel?: string;
  /** PostgreSQL连接字符串 */
  pgConnectionString?: string;
  /** 向量表名 */
  tablePrefix?: string;
  /** 向量维度 */
  dimensions?: number;
  /** 批处理大小 */
  batchSize?: number;
}

/**
 * 向量查询选项
 */
export interface VectorQueryOptions {
  /** 相似度阈值 (0-1) */
  similarityThreshold?: number;
  /** 最大结果数 */
  maxResults?: number;
  /** 过滤元数据 */
  filter?: Record<string, any>;
  /** 是否包含向量 */
  includeVector?: boolean;
}

/**
 * 向量查询结果
 */
export interface VectorQueryResult {
  /** 文档块 */
  document: DocumentChunk;
  /** 相似度得分 */
  score: number;
}

/**
 * 嵌入结果接口
 */
interface EmbeddingResult {
  document: DocumentChunk;
  embedding: number[];
}

interface MastraVectorStoreOptions {
  apiKey: string;
  pgConnectionString?: string; // 保留作为备选
  tablePrefix?: string;
  batchSize?: number;
  embedModel?: string;
}

/**
 * Mastra向量存储类
 * 
 * 基于Mastra框架的PgVector实现向量存储功能
 */
export class MastraVectorStore {
  private apiKey: string;
  private pgConnectionString: string;
  private tablePrefix: string;
  private batchSize: number = 10; // 从20减少到10，减轻内存压力
  private embedModel: string;
  private pgPool: PgVector | null = null;
  private memoryManager: MemoryManager;
  private initialized: boolean = false;
  
  constructor(options: MastraVectorStoreOptions) {
    this.apiKey = options.apiKey;
    this.pgConnectionString = options.pgConnectionString || '';
    this.tablePrefix = options.tablePrefix || 'document_embeddings';
    this.embedModel = options.embedModel || 'text-embedding-3-small';
    
    if (options.batchSize) {
      this.batchSize = options.batchSize;
    }
    this.memoryManager = MemoryManager.getInstance();
    
    logger.info(`初始化MastraVectorStore，批次大小: ${this.batchSize}, 模型: ${this.embedModel}`);
  }
  
  /**
   * 初始化向量存储
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    
    logger.info('初始化Mastra向量存储...');
    
    try {
      // 尝试从Mastra实例获取pgVector
      const pgVectorFromMastra = mastra.getVector('pgVector');
      
      if (pgVectorFromMastra) {
        this.pgPool = pgVectorFromMastra;
        logger.info('从Mastra实例获取到pgVector');
      } else {
        // 回退到使用连接字符串创建新实例
        if (!this.pgConnectionString) {
          logger.error('无法初始化向量存储：未在Mastra实例中找到pgVector，也未提供PostgreSQL连接字符串');
          return false;
        }
        
        logger.info('Mastra实例中未找到pgVector，使用连接字符串创建新实例');
        this.pgPool = new PgVector(this.pgConnectionString);
      }
      
      // 设置OpenAI API密钥
      if (this.apiKey) {
        process.env.OPENAI_API_KEY = this.apiKey;
      }
      
      // 创建索引
      await this.pgPool.createIndex({
        indexName: this.tablePrefix,
        dimension: 1536,  // 默认OpenAI嵌入维度
        metric: 'cosine'
      });
      
      this.initialized = true;
      logger.info('Mastra向量存储初始化成功');
      return true;
    } catch (error) {
      logger.error('初始化Mastra向量存储失败:', error);
      return false;
    }
  }
  
  /**
   * 确保初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        throw createConfigurationError('无法初始化向量存储');
      }
    }
  }
  
  /**
   * 向量化并存储文档
   */
  async storeDocuments(documents: DocumentChunk[]): Promise<number> {
    // 记录开始时间，用于计算性能
    const startTime = Date.now();
    
    // 记录开始时的内存使用情况
    this.memoryManager.checkMemory('向量化前');
    
    await this.ensureInitialized();
    
    if (!documents || documents.length === 0) {
      return 0;
    }
    
    logger.info(`开始向量化 ${documents.length} 个文档块`);
    
    try {
      // 处理一个较小的批次以减少内存压力
      const batchSize = this.batchSize;
      let successCount = 0;
      
      for (let i = 0; i < documents.length; i += batchSize) {
        const batchStartTime = Date.now();
        const batch = documents.slice(i, i + batchSize);
        
        // 向量化文档批次
        const embeddingResults = await this.createEmbeddings(batch);
        
        if (embeddingResults && embeddingResults.length > 0) {
          // 存储向量化结果
          const storedCount = await this.storeEmbeddings(embeddingResults);
          successCount += storedCount;
          
          const batchEndTime = Date.now();
          logger.info(`批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(documents.length/batchSize)} 完成: ` + 
                     `向量化并存储了 ${storedCount}/${batch.length} 个文档，` + 
                     `耗时 ${batchEndTime - batchStartTime}ms`);
          
          // 每个批次后尝试垃圾回收
          this.memoryManager.tryGC();
          
          // 添加小延迟以避免OpenAI API限制
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      const endTime = Date.now();
      
      // 记录完成后的内存使用情况
      this.memoryManager.checkMemory('向量化后');
      
      logger.info(`完成向量化: 成功处理 ${successCount}/${documents.length} 个文档块，` + 
                 `总耗时 ${endTime - startTime}ms`);
      
      return successCount;
    } catch (error) {
      logger.error(`向量化存储过程中出错: ${error}`);
      throw error;
    }
  }

  /**
   * 创建文档嵌入向量
   */
  private async createEmbeddings(documents: DocumentChunk[]): Promise<EmbeddingResult[]> {
    if (!documents || documents.length === 0) {
      return [];
    }
    
    logger.debug(`创建 ${documents.length} 个文档的嵌入向量`);
    
    try {
      // 准备文本内容
      const texts = documents.map(doc => doc.content.trim());
      
      // 创建向量嵌入
      const { embeddings } = await embedMany({
        values: texts,
        model: openai.embedding(this.embedModel),
        maxRetries: 2
      });
      
      // 将嵌入结果与文档关联
      return embeddings.map((embedding, index) => ({
        document: documents[index],
        embedding
      }));
    } catch (error) {
      logger.error(`创建嵌入向量时出错: ${error.message}`);
      if (error.response) {
        logger.error(`OpenAI API错误: ${JSON.stringify(error.response.data)}`);
      }
      
      if (documents.length > 1) {
        // 如果批处理失败，尝试单个文档处理
        logger.info(`尝试单个文档处理而不是批处理 ${documents.length} 个文档`);
        
        const results: EmbeddingResult[] = [];
        for (const doc of documents) {
          try {
            const singleResult = await this.createEmbeddings([doc]);
            if (singleResult.length > 0) {
              results.push(singleResult[0]);
            }
          } catch (e) {
            logger.error(`单个文档处理失败: ${e.message}`);
          }
          
          // 添加小延迟以避免API限制
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return results;
      }
      
      return [];
    }
  }
  
  /**
   * 尝试使用多种可能的方法名删除文档
   * @private
   */
  private async tryDeleteVectors(options: any): Promise<boolean> {
    if (!this.pgPool) return false;
    
    // 根据Mastra.ai文档，更新可能的删除方法名列表
    const possibleMethodNames = [
      'deleteIndex', 'deleteIndexById', 'delete', 'remove', 'deleteVectors', 
      'deleteIds', 'deleteByIds', 'deletePoints', 'removeByIds', 'deleteById'
    ];
    
    // 查找可用的方法
    const availableMethods = Object.getOwnPropertyNames(this.pgPool)
      .filter(name => typeof this.pgPool[name] === 'function');
    
    logger.debug(`PgVector可用方法: ${availableMethods.join(', ')}`);
    
    // 索引名和ID（用于直接传参的方法）
    const indexName = options.indexName;
    const id = options.id;
    const ids = options.ids;
    
    // 尝试每个可能的删除方法
    for (const methodName of possibleMethodNames) {
      if (typeof this.pgPool[methodName] === 'function') {
        try {
          logger.info(`尝试使用 ${methodName} 方法删除文档`);
          
          // 根据方法名使用不同的参数格式
          if (methodName === 'deleteIndex') {
            // 直接传递索引名
            await this.pgPool[methodName](indexName);
          } else if (methodName === 'deleteIndexById' && id) {
            // 直接传递索引名和ID
            await this.pgPool[methodName](indexName, id);
          } else if (methodName.includes('Ids') && ids) {
            // 可能接受id数组的方法
            await this.pgPool[methodName](indexName, ids);
          } else {
            // 默认使用对象参数
            await this.pgPool[methodName](options);
          }
          
          logger.info(`成功使用 ${methodName} 方法删除文档`);
          return true;
        } catch (error) {
          logger.warn(`使用 ${methodName} 方法删除文档失败:`, error);
          
          // 如果是参数格式错误，尝试使用不同的参数格式
          if (error.message && error.message.includes('syntax error')) {
            try {
              logger.info(`尝试使用不同的参数格式再次调用 ${methodName} 方法`);
              
              if (methodName === 'deleteIndex' || methodName === 'delete') {
                // 尝试使用对象参数
                await this.pgPool[methodName]({ indexName });
              } else if (methodName === 'deleteIndexById' && id) {
                // 尝试使用对象参数
                await this.pgPool[methodName]({ indexName, id });
              } else if (id) {
                // 尝试直接传递ID
                await this.pgPool[methodName](id);
              } else if (ids) {
                // 尝试直接传递ID数组
                await this.pgPool[methodName](ids);
              }
              
              logger.info(`成功使用不同的参数格式调用 ${methodName} 方法`);
              return true;
            } catch (retryError) {
              logger.warn(`使用不同参数格式调用 ${methodName} 方法失败:`, retryError);
            }
          }
        }
      }
    }
    
    return false;
  }
  
  /**
   * 根据文本查询文档
   * 使用 Mastra PgVector 原生的 query 方法
   */
  async queryByText(query: string, options: VectorQueryOptions = {}): Promise<VectorQueryResult[]> {
    await this.ensureInitialized();
    
    // 合并默认选项
    const mergedOptions = {
      similarityThreshold: 0.7,
      maxResults: 10,
      includeVector: false,
      ...options
    };
    
    logger.info(`执行文本查询: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    
    return await safeExecute(async () => {
      if (!this.pgPool) {
        throw createConfigurationError('PgVector未初始化');
      }
      
      // 生成查询向量
      const { embeddings } = await embedMany({
        values: [query],
        model: openai.embedding(this.embedModel),
        maxRetries: 2
      });
      
      if (!embeddings || embeddings.length === 0) {
        throw new Error('生成查询嵌入失败');
      }
      
      // 使用 PgVector 的原生 query 方法
      const results = await this.pgPool.query({
        indexName: this.tablePrefix,
        queryVector: embeddings[0],
        topK: mergedOptions.maxResults,
        filter: options.filter,
        includeValues: mergedOptions.includeVector,
        minScore: mergedOptions.similarityThreshold
      });
      
      // 转换结果格式
      return results.map(result => ({
        document: result.metadata as DocumentChunk,
        score: result.score
      }));
    }, (error) => {
      logger.error('查询文档时出错:', error);
      return [];
    });
  }
  
  /**
   * 删除文档
   * 使用 Mastra PgVector 的API删除文档
   */
  async deleteDocuments(ids: string[]): Promise<number> {
    await this.ensureInitialized();
    
    if (ids.length === 0) {
      return 0;
    }
    
    logger.info(`删除 ${ids.length} 个文档...`);
    
    try {
      if (!this.pgPool) {
        throw createConfigurationError('PgVector未初始化');
      }
      
      let deletedCount = 0;
      
      // 处理通配符
      if (ids.length === 1 && ids[0] === '*') {
        try {
          // 根据Mastra.ai文档，deleteIndex方法直接接收索引名称作为参数
          if (typeof this.pgPool.deleteIndex === 'function') {
            // 正确的调用方式
            await this.pgPool.deleteIndex(this.tablePrefix);
            logger.info('成功使用deleteIndex方法删除所有文档');
            
            // 重建索引
            await this.pgPool.createIndex({
              indexName: this.tablePrefix,
              dimension: 1536,
              metric: 'cosine'
            });
            logger.info('成功重建索引');
            
            return 1; // 返回1表示成功删除所有
          }
          
          // 如果deleteIndex方法不存在，尝试其他方法
          const deleteAllSuccess = await this.tryDeleteVectors({
            indexName: this.tablePrefix
          });
          
          if (deleteAllSuccess) {
            logger.info('成功删除所有文档');
            return 1; // 返回1表示成功删除所有
          }
          
          logger.warn('尝试其他方法删除所有文档');
          
          // 查询所有文档ID
          const results = await this.pgPool.query({
            indexName: this.tablePrefix,
            queryVector: new Array(1536).fill(0),
            topK: 1000
          });
          
          if (results.length > 0) {
            const documentIds = results.map(r => r.id);
            deletedCount = await this.deleteDocuments(documentIds);
          }
        } catch (error) {
          logger.warn('删除所有文档失败，尝试其他方法:', error);
          
          // 尝试清空表的备选方案
          try {
            logger.info('尝试通过重建索引来清空数据');
            await this.pgPool.createIndex({
              indexName: this.tablePrefix,
              dimension: 1536,
              metric: 'cosine',
              overwrite: true
            });
            logger.info('通过重建索引成功清空所有数据');
            return 1;
          } catch (rebuildError) {
            logger.error('通过重建索引清空数据失败:', rebuildError);
          }
        }
      } else {
        // 删除指定ID的文档
        
        // 尝试批量删除
        const batchDeleteSuccess = await this.tryDeleteVectors({
          indexName: this.tablePrefix,
          ids: ids
        });
        
        if (batchDeleteSuccess) {
          deletedCount = ids.length;
          logger.info(`成功批量删除 ${deletedCount} 个文档`);
        } else {
          logger.warn('批量删除失败，尝试逐个删除');
          
          // 逐个删除
          for (const id of ids) {
            try {
              // 根据Mastra.ai文档，尝试使用deleteIndexById方法
              if (typeof this.pgPool.deleteIndexById === 'function') {
                // deleteIndexById可能也需要直接传递索引名和ID
                await this.pgPool.deleteIndexById(this.tablePrefix, id);
                deletedCount++;
                logger.info(`成功使用deleteIndexById删除文档 ${id}`);
                continue;
              }
              
              // 如果deleteIndexById不存在，尝试其他方法
              const singleDeleteSuccess = await this.tryDeleteVectors({
                indexName: this.tablePrefix,
                id: id
              });
              
              if (singleDeleteSuccess) {
                deletedCount++;
              } else {
                logger.error(`无法找到适合的方法删除文档 ${id}`);
              }
            } catch (singleError) {
              logger.error(`删除文档 ${id} 失败:`, singleError);
            }
          }
        }
      }
      
      logger.info(`成功删除 ${deletedCount} 个文档`);
      return deletedCount;
    } catch (error) {
      logger.error('删除文档时出错:', error);
      return 0;
    }
  }
  
  /**
   * 存储向量化结果
   */
  private async storeEmbeddings(results: EmbeddingResult[]): Promise<number> {
    if (!results || results.length === 0) {
      return 0;
    }
    
    logger.debug(`存储 ${results.length} 个文档嵌入向量`);
    
    try {
      if (!this.pgPool) {
        throw createConfigurationError('PgVector未初始化');
      }
      
      // 准备批量upsert的数据格式
      const vectors = results.map(result => result.embedding);
      const metadata = results.map(result => result.document);
      const ids = results.map(result => result.document.id);
      
      logger.info(`使用PgVector.upsert批量存储 ${vectors.length} 个向量`);
      
      // 使用Mastra的PgVector upsert方法批量处理
      await this.pgPool.upsert({
        indexName: this.tablePrefix,
        vectors: vectors,
        metadata: metadata,
        ids: ids
      });
      
      logger.info(`成功存储 ${results.length} 个文档嵌入向量`);
      return results.length;
    } catch (error) {
      logger.error(`存储文档嵌入向量过程中出错: ${error.message}`);
      
      // 如果批量操作失败，尝试逐个插入
      if (results.length > 1) {
        logger.info(`批量存储失败，尝试单个文档处理`);
        let successCount = 0;
        
        for (const result of results) {
          try {
            const { document, embedding } = result;
            
            await this.pgPool.upsert({
              indexName: this.tablePrefix,
              vectors: [embedding],
              metadata: [document],
              ids: [document.id]
            });
            
            successCount++;
          } catch (e) {
            logger.error(`单个文档存储失败: ${e.message}`);
          }
        }
        
        logger.info(`通过单个文档处理成功存储 ${successCount}/${results.length} 个文档`);
        return successCount;
      }
      
      return 0;
    }
  }
  
  /**
   * 关闭连接并释放资源
   */
  async close(): Promise<void> {
    if (this.pgPool) {
      logger.info('关闭Postgres连接池');
      try {
        // 根据Mastra文档，PgVector使用disconnect()方法关闭连接
        if (typeof this.pgPool.disconnect === 'function') {
          await this.pgPool.disconnect();
          logger.info('成功关闭PgVector连接池（使用disconnect方法）');
        } 
        // 尝试其他可能的方法
        else if (typeof this.pgPool.end === 'function') {
          await this.pgPool.end();
          logger.info('成功关闭PgVector连接池（使用end方法）');
        } else if (typeof this.pgPool.close === 'function') {
          await this.pgPool.close();
          logger.info('成功关闭PgVector连接池（使用close方法）');
        } else if (typeof this.pgPool.destroy === 'function') {
          await this.pgPool.destroy();
          logger.info('成功关闭PgVector连接池（使用destroy方法）');
        } else {
          // 如果没有找到匹配的方法，记录可用方法用于调试
          logger.warn('无法找到合适的方法关闭PgVector连接池，可用方法:',
            Object.getOwnPropertyNames(this.pgPool)
              .filter(name => typeof this.pgPool[name] === 'function')
              .join(', ')
          );
        }
      } catch (error) {
        logger.warn(`关闭Postgres连接池时出错: ${error.message}`);
      }
      this.pgPool = null;
      
      // 尝试释放内存
      this.memoryManager.tryGC(true);
    }
  }
} 