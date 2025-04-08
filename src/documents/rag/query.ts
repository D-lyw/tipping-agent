/**
 * CKB生态文档处理模块 - RAG查询功能
 * 
 * 提供向量数据库查询和文档检索功能
 */

import { VectorQueryOptions, VectorQueryResult } from '../storage/mastra-vector-store';
import { MastraVectorStore } from '../storage/mastra-vector-store';
import { DocumentChunk } from '../core/types';
import { createLogger } from '../utils/logger';
import { safeExecute } from '../utils/errors';
import { createDocumentManager } from '../index';
import * as dotenv from 'dotenv';
// 导入 Mastra 实例以获取 pgVector
import { mastra } from '../../mastra/index.js';
// 导入配置
import { 
  OPENAI_API_KEY, 
  PG_VECTOR_TABLE,
  DEFAULT_BATCH_SIZE
} from '../core/config.js';

// 加载环境变量
dotenv.config();

// 初始化日志记录器
const logger = createLogger('RagQuery');

// 配置
const DEFAULT_LIMIT = 5;
const MAX_DOCS = process.env.MAX_DOCS ? parseInt(process.env.MAX_DOCS, 10) : undefined;

// 单例向量存储
let vectorStore: MastraVectorStore | null = null;

/**
 * 初始化或获取向量存储实例
 */
export async function getVectorStore(): Promise<MastraVectorStore> {
  if (!vectorStore) {
    logger.info('初始化向量存储...');
    
    if (!OPENAI_API_KEY) {
      throw new Error('未配置OpenAI API密钥，请在.env文件中设置OPENAI_API_KEY');
    }
    
    // 创建向量存储实例 - MastraVectorStore会自动获取Mastra中的pgVector
    vectorStore = new MastraVectorStore({
      apiKey: OPENAI_API_KEY,
      tablePrefix: PG_VECTOR_TABLE
    });
    
    await vectorStore.initialize();
    logger.info('向量存储初始化完成');
  }
  
  return vectorStore;
}

/**
 * 索引所有文档
 * 使用新的Mastra向量存储实现
 */
export async function indexAllDocuments(): Promise<number> {
  logger.info('开始索引所有文档...');
  
  return await safeExecute(async () => {
    // 获取文档管理器
    const documentManager = createDocumentManager();
    await documentManager.initialize();
    
    // 获取所有文档片段
    const allDocuments = documentManager.getAllDocumentChunks();
    logger.info(`从文档管理器获取到 ${allDocuments.length} 个文档片段`);
    
    if (allDocuments.length === 0) {
      logger.info('尝试从数据源获取文档...');
      const results = await documentManager.fetchAllSources();
      const successfulResults = results.filter(r => r.success);
      
      if (successfulResults.length > 0) {
        logger.info(`成功从 ${successfulResults.length} 个数据源获取文档`);
      } else {
        logger.warn('无法从任何数据源获取文档');
        return 0;
      }
    }
    
    // 处理本地文档目录 data/ckb-docs
    logger.info('处理本地文档目录 data/ckb-docs...');
    const localDocsPath = './data/ckb-docs';
    const localDocChunks = await documentManager.addLocalDirectory(localDocsPath, 'CKB本地文档');
    logger.info(`从本地文档目录获取到 ${localDocChunks.length} 个文档片段`);
    
    // 获取向量存储并存储文档
    const store = await getVectorStore();
    let chunksToStore = documentManager.getAllDocumentChunks();
    
    // 限制文档数量
    if (MAX_DOCS && chunksToStore.length > MAX_DOCS) {
      logger.info(`由于 MAX_DOCS=${MAX_DOCS} 的限制，仅处理 ${MAX_DOCS}/${chunksToStore.length} 个文档`);
      chunksToStore = chunksToStore.slice(0, MAX_DOCS);
    }
    
    const storedCount = await store.storeDocuments(chunksToStore);
    
    logger.info(`成功将 ${storedCount} 个文档片段存储到向量数据库`);
    return storedCount;
  }, (error) => {
    logger.error('索引文档时出错:', error);
    return 0;
  });
}

/**
 * 根据查询文本检索相关文档
 * 使用新的Mastra向量存储实现
 */
export async function queryDocuments(queryText: string, limit: number = DEFAULT_LIMIT): Promise<VectorQueryResult[]> {
  logger.info(`执行查询: "${queryText}"`);
  
  return await safeExecute(async () => {
    const store = await getVectorStore();
    
    const options: VectorQueryOptions = {
      maxResults: limit,
      similarityThreshold: 0.7
    };
    
    const results = await store.queryByText(queryText, options);
    logger.info(`查询完成，找到 ${results.length} 个相关文档片段`);
    
    return results;
  }, (error) => {
    logger.error('查询文档时出错:', error);
    return [];
  });
}

/**
 * 重建向量索引
 */
export async function rebuildIndex(): Promise<number> {
  logger.info('开始重建向量索引...');
  
  return await safeExecute(async () => {
    // 获取向量存储
    const store = await getVectorStore();
    
    // 删除所有文档
    await store.deleteDocuments(['*']);
    logger.info('已清空向量存储');
    
    // 获取文档管理器
    const documentManager = createDocumentManager();
    await documentManager.initialize();
    
    // 清除缓存，强制从源重新获取
    await documentManager.clearCache();
    
    if (MAX_DOCS) {
      logger.info(`设置了 MAX_DOCS=${MAX_DOCS}，将限制处理的文档数量`);
    }
    
    // 重新索引
    return await indexAllDocuments();
  }, (error) => {
    logger.error('重建索引时出错:', error);
    return 0;
  });
}

/**
 * 添加自定义文档
 */
export async function addCustomDocument(
  content: string,
  title: string,
  source: string,
  url: string = ''
): Promise<boolean> {
  logger.info(`添加自定义文档: ${title}`);
  
  return await safeExecute(async () => {
    // 创建文档对象
    const docId = `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const customDoc: DocumentChunk = {
      id: docId,
      content,
      title,
      url,
      source,
      category: 'custom',
      createdAt: Date.now(),
      metadata: {
        custom: true
      }
    };
    
    // 获取向量存储并存储文档
    const store = await getVectorStore();
    const storedCount = await store.storeDocuments([customDoc]);
    
    return storedCount > 0;
  }, (error) => {
    logger.error('添加自定义文档时出错:', error);
    return false;
  });
} 