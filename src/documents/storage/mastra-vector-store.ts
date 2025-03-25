// @ts-nocheck
/**
 * CKB生态文档处理模块 - Mastra向量存储
 * 
 * 基于Mastra框架的PgVector实现向量存储功能
 */

import { createLogger } from '../utils/logger';
import { DocumentChunk } from '../core/types';
import { safeExecute, createConfigurationError } from '../utils/errors';
import * as dotenv from 'dotenv';
import { PgVector } from '@mastra/pg';
import { generateId } from '../utils/helpers';
import { OpenAI } from 'openai';

// 加载环境变量
dotenv.config();

// 初始化日志记录器
const logger = createLogger('MastraVectorStore');

/**
 * OpenAI API配置
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

/**
 * 向量数据库配置
 */
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || '';
const PG_VECTOR_TABLE = process.env.PG_VECTOR_TABLE || 'document_embeddings';

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
 * 使用Mastra PgVector实现的文档向量存储类
 */
export class MastraVectorStore {
  private config: Required<VectorStoreConfig>;
  private pgVector: PgVector | null = null;
  private openai: OpenAI | null = null;
  private initialized: boolean = false;
  
  constructor(config: VectorStoreConfig = {}) {
    // 默认配置
    const defaultConfig: Required<VectorStoreConfig> = {
      apiKey: OPENAI_API_KEY,
      embeddingModel: OPENAI_EMBEDDING_MODEL,
      pgConnectionString: PG_CONNECTION_STRING,
      tablePrefix: PG_VECTOR_TABLE,
      dimensions: 1536,  // 默认OpenAI嵌入维度
      batchSize: 50      // 每批处理的文档数
    };
    
    this.config = { ...defaultConfig, ...config };
    
    if (!this.config.apiKey) {
      logger.warn('未提供OpenAI API密钥，嵌入功能将不可用');
    }
    
    if (!this.config.pgConnectionString) {
      logger.warn('未提供PostgreSQL连接字符串，存储功能将不可用');
    }
  }
  
  /**
   * 初始化向量存储
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    
    logger.info('初始化Mastra向量存储...');
    
    if (!this.config.pgConnectionString) {
      logger.error('无法初始化向量存储：未提供PostgreSQL连接字符串');
      return false;
    }
    
    try {
      // 初始化PgVector
      this.pgVector = new PgVector(this.config.pgConnectionString);
      
      // 初始化OpenAI客户端
      if (this.config.apiKey) {
        this.openai = new OpenAI({
          apiKey: this.config.apiKey
        });
      }
      
      // 根据类型错误，需要对函数调用进行强制类型转换
      // @ts-ignore 强制忽略类型错误
      await this.pgVector.createIndex({
        tableName: this.config.tablePrefix,
        dimensions: this.config.dimensions,
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
   * 获取文本嵌入
   */
  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw createConfigurationError('OpenAI客户端未初始化');
    }
    
    if (texts.length === 0) {
      return [];
    }
    
    logger.info(`生成 ${texts.length} 个文本的嵌入...`);
    
    // 调用OpenAI API
    const response = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: texts,
      encoding_format: 'float'
    });
    
    // 返回嵌入向量
    return response.data.map(item => item.embedding);
  }
  
  /**
   * 将文档块向量化并存储
   */
  async storeDocuments(documents: DocumentChunk[]): Promise<number> {
    await this.ensureInitialized();
    
    if (documents.length === 0) {
      logger.info('没有文档需要存储');
      return 0;
    }
    
    logger.info(`开始向量化并存储 ${documents.length} 个文档块...`);
    
    // 检查API密钥
    if (!this.config.apiKey || !this.openai) {
      throw createConfigurationError('未设置OpenAI API密钥，无法生成嵌入');
    }
    
    if (!this.pgVector) {
      throw createConfigurationError('PgVector未初始化');
    }
    
    let successCount = 0;
    
    // 按批次处理
    for (let i = 0; i < documents.length; i += this.config.batchSize) {
      const batch = documents.slice(i, i + this.config.batchSize);
      
      try {
        // 获取嵌入
        const embeddings = await this.getEmbeddings(batch.map(doc => doc.content));
        
        // 存储文档和嵌入
        await this.storeBatch(batch, embeddings);
        
        successCount += batch.length;
        logger.info(`成功处理批次 ${i/this.config.batchSize + 1}/${Math.ceil(documents.length/this.config.batchSize)}`);
      } catch (error) {
        logger.error(`处理批次 ${i/this.config.batchSize + 1} 时出错:`, error);
      }
    }
    
    logger.info(`完成向量化和存储，成功处理 ${successCount}/${documents.length} 个文档块`);
    return successCount;
  }
  
  /**
   * 根据文本查询文档
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
      // 获取查询文本的嵌入
      const [queryEmbedding] = await this.getEmbeddings([query]);
      
      if (!this.pgVector) {
        throw createConfigurationError('PgVector未初始化');
      }
      
      // 根据类型错误，需要对函数调用进行强制类型转换
      // @ts-ignore 强制忽略类型错误
      const results = await this.pgVector.query({
        tableName: this.config.tablePrefix,
        queryVector: queryEmbedding,
        topK: mergedOptions.maxResults,
        filter: options.filter,
        includeValues: false,
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
   */
  async deleteDocuments(ids: string[]): Promise<number> {
    await this.ensureInitialized();
    
    if (ids.length === 0) {
      return 0;
    }
    
    logger.info(`删除 ${ids.length} 个文档...`);
    
    try {
      if (!this.pgVector) {
        throw createConfigurationError('PgVector未初始化');
      }
      
      let deletedCount = 0;
      
      // 通配符处理
      if (ids.length === 1 && ids[0] === '*') {
        // 删除所有文档
        try {
          // 尝试使用deleteAll方法（如果可用）
          if (typeof this.pgVector.deleteAll === 'function') {
            await this.pgVector.deleteAll({
              tableName: this.config.tablePrefix
            });
            deletedCount = 1; // 我们不知道确切的删除数量
          } else {
            // 如果deleteAll不可用，则使用查询后批量删除
            logger.warn('API不支持通过通配符删除所有文档，将尝试使用查询后删除');
            
            // 查询所有文档ID
            // @ts-ignore 强制忽略类型错误
            const results = await this.pgVector.query({
              tableName: this.config.tablePrefix,
              queryVector: new Array(this.config.dimensions).fill(0),
              topK: 1000, // 获取一个合理数量的文档
              includeValues: false
            });
            
            // 批量删除
            if (results.length > 0) {
              const documentIds = results.map(r => r.id);
              await this.deleteDocuments(documentIds);
              deletedCount = documentIds.length;
            }
          }
        } catch (wildcardError) {
          logger.error('使用通配符删除所有文档时出错:', wildcardError);
          deletedCount = 0;
        }
        
        logger.info(`通过通配符删除了文档`);
      } else {
        // 逐个删除文档
        for (const id of ids) {
          // 根据类型错误，需要对函数调用进行强制类型转换
          // @ts-ignore 强制忽略类型错误
          await this.pgVector.upsert({
            tableName: this.config.tablePrefix,
            vectors: [{
              id,
              vector: new Array(this.config.dimensions).fill(0),
              delete: true
            }]
          });
          deletedCount++;
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
   * 关闭连接
   */
  async close(): Promise<void> {
    this.initialized = false;
    // PgVector实例不需要显式关闭
  }
  
  /**
   * 存储一批文档及其嵌入
   */
  private async storeBatch(documents: DocumentChunk[], embeddings: number[][]): Promise<void> {
    if (!this.pgVector) {
      throw createConfigurationError('PgVector未初始化');
    }
    
    // 准备批量upsert的向量列表
    const vectors = documents.map((doc, index) => {
      // 使用文档ID或生成新ID
      const id = doc.id || generateId('doc', 8);
      
      // 更新文档ID
      const docWithId = { ...doc, id };
      
      // 确保向量是一个数组
      const vector = Array.isArray(embeddings[index]) ? embeddings[index] : [];
      
      // 添加调试日志
      if (index === 0) {
        logger.debug(`向量类型: ${typeof vector}, 是否数组: ${Array.isArray(vector)}, 长度: ${vector.length}`);
      }
      
      return {
        id,
        vector,
        metadata: docWithId
      };
    });
    
    try {
      // 根据类型错误，需要对函数调用进行强制类型转换
      // @ts-ignore 强制忽略类型错误
      await this.pgVector.upsert({
        tableName: this.config.tablePrefix,
        vectors: vectors
      });
    } catch (error) {
      logger.error('调用 upsert 失败:', error);
      // 记录第一个向量的详细信息以便调试
      if (vectors.length > 0) {
        const firstVector = vectors[0];
        logger.debug(`第一个向量详情:`, {
          id: firstVector.id,
          vectorType: typeof firstVector.vector,
          isArray: Array.isArray(firstVector.vector),
          vectorLength: Array.isArray(firstVector.vector) ? firstVector.vector.length : 0,
          metadata: firstVector.metadata
        });
      }
      throw error;
    }
  }
} 