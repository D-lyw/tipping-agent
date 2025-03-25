/**
 * CKB文档RAG工具
 * 
 * 提供基于PgVector的高级文档检索工具
 */

import { z } from 'zod';
// 从新的模块导入替代旧的引用
import { 
  queryDocuments,
  formatQueryResults,
  formatAgentResponseRag
} from '../../documents/index.js';

/**
 * 高级文档检索工具 - 使用向量相似度搜索
 */
export const ckbDocumentVectorSearchTool = {
  id: "ckb_document_vector_search",
  description: "使用向量相似度在CKB生态文档中搜索与查询最相关的内容",
  inputSchema: z.object({
    query: z.string().describe("查询内容"),
    limit: z.number().optional().describe("返回结果数量限制，默认为5")
  }),
  execute: async (context: { 
    input?: {
      query?: string;
      limit?: number;
    } 
  }) => {
    const query = context.input?.query || "";
    const limit = context.input?.limit || 5;
    
    if (!query) {
      return "请提供查询内容";
    }
    
    try {
      console.log(`执行向量搜索: "${query}", limit=${limit}`);
      
      // 使用向量相似度搜索
      const results = await queryDocuments(query, limit);
      
      // 如果没有结果
      if (results.length === 0) {
        return "没有找到与查询相关的文档。";
      }
      
      // 格式化结果
      return formatQueryResults(results);
    } catch (error) {
      console.error('向量搜索执行出错:', error);
      return `执行搜索时发生错误: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};

/**
 * 为Agent格式化结果
 */
export { formatAgentResponseRag }; 