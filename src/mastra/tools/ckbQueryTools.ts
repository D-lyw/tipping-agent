/**
 * CKB文档向量查询工具
 * 
 * 使用 Mastra 提供的标准 createVectorQueryTool 函数创建向量查询工具
 * 使用 Mastra 实例中已配置的 pgVector
 */

import { openai } from '@ai-sdk/openai';
import { createVectorQueryTool, createGraphRAGTool } from '@mastra/rag';
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
  description: '在CKB生态文档中搜索与查询最相关的内容, 包括所有文档和代码'
});

/**
 * 创建标准的图形化RAG工具
 * 直接使用 Mastra 实例中的 pgVector
 */
export const graphRAGTool = createGraphRAGTool({
  vectorStoreName: 'pgVector', // 这里的名称要与 mastra 配置中的 vectors 对象中的键名一致
  indexName: process.env.PG_VECTOR_TABLE,
  model: openai.embedding(process.env.OPENAI_EMBEDDING_MODEL),
  graphOptions: {
    dimension: 1536,
    threshold: 0.7,
    randomWalkSteps: 100,
    restartProb: 0.15
  },
  description: '分析CKB生态文档中信息之间的关系，以回答关于连接和模式的复杂问题'
});

// 导出默认配置
export default { vectorQueryTool, graphRAGTool }; 