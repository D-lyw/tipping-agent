/**
 * CKB文档向量查询工具
 * 
 * 使用 Mastra 提供的标准 createVectorQueryTool 函数创建向量查询工具
 * 使用 Mastra 实例中已配置的 pgVector
 */

import { openai } from '@ai-sdk/openai';
import { createVectorQueryTool } from '@mastra/rag';
import { mastra } from '../index.js';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 创建标准的向量查询工具
 * 直接使用 Mastra 实例中的 pgVector
 */
export const vectorQueryTool = createVectorQueryTool({
  vectorStoreName: 'pgVector', // 这里的名称要与 mastra 配置中的 vectors 对象中的键名一致
  indexName: process.env.PG_VECTOR_TABLE,
  model: openai.embedding(process.env.OPENAI_EMBEDDING_MODEL),
  id: 'ckb_vector_search',
  description: '使用向量相似度在CKB生态文档中搜索与查询最相关的内容'
});

/**
 * 导出默认配置
 */
export default vectorQueryTool; 