/**
 * CKB文档工具函数
 * 
 * 包含文档检索和处理的工具，用于CKB文档智能体
 */

import { z } from 'zod';
import { fetchAllDocuments, DocumentChunk } from '../../lib/ckbDocuments.js';

/**
 * 文档检索工具
 */
export const ckbDocumentRetrievalTool = {
  id: "ckb_document_retrieval",
  description: "搜索CKB生态相关的技术文档来回答问题",
  inputSchema: z.object({
    query: z.string().describe("查询内容"),
    limit: z.number().optional().describe("返回结果数量限制")
  }),
  execute: async (context: any) => {
    // 获取文档数据
    const documents = await fetchAllDocuments();
    console.log(`工具执行: 加载了 ${documents.length} 个CKB文档片段`);
    
    const query = context.input?.query || "";
    const limit = context.input?.limit || 5;
    
    if (!query) {
      return "请提供查询内容";
    }
    
    // 简单的词频相似度计算（在生产环境中应该使用更高级的方法）
    function calculateSimilarity(text1: string, text2: string): number {
      // 转换为小写并分词
      const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 0);
      const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 0);
      
      // 计算共同词汇
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      const intersection = [...set1].filter(word => set2.has(word));
      
      // 计算相似度（Jaccard系数）
      return intersection.length / (set1.size + set2.size - intersection.length);
    }
    
    // 计算文档相似度
    const scoredDocs = documents.map(doc => ({
      document: doc,
      score: calculateSimilarity(query, doc.content)
    }));
    
    // 排序并选择前N个结果
    scoredDocs.sort((a, b) => b.score - a.score);
    const topDocs = scoredDocs.slice(0, limit).map(item => item.document);
    
    if (topDocs.length === 0) {
      return "没有找到与查询相关的文档。";
    }
    
    // 格式化结果
    const formattedDocs = topDocs.map(doc => {
      return `
标题: ${doc.title}
来源: ${doc.source}
链接: ${doc.url}
内容:
${doc.content}
-------------------`;
    }).join('\n');
    
    return `找到 ${topDocs.length} 个相关文档片段：\n${formattedDocs}`;
  }
};

/**
 * 格式化智能体响应的辅助函数
 */
export function formatAgentResponse(response: any): string {
  // 根据响应类型返回适当的内容
  if (typeof response === 'string') {
    return response;
  } else if (typeof response === 'object' && response !== null) {
    // 尝试访问可能存在的属性
    if ('text' in response && typeof response.text === 'string') {
      return response.text;
    } else if ('content' in response && typeof (response as any).content === 'string') {
      return (response as any).content;
    } else if ('message' in response && typeof (response as any).message === 'object') {
      // 处理新版API返回的消息格式
      const message = (response as any).message;
      return message.content || String(message);
    }
  }
  
  // 默认情况下转换为字符串
  return String(response);
} 