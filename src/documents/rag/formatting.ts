/**
 * CKB生态文档处理模块 - RAG结果格式化
 * 
 * 提供查询结果的格式化和处理功能
 */

import { VectorQueryResult } from '../storage/mastra-vector-store';
import { createLogger } from '../utils/logger';

// 初始化日志记录器
const logger = createLogger('RagFormatting');

/**
 * 格式化查询结果为文本
 * 兼容旧API，保持相同的输出格式
 */
export function formatQueryResults(results: VectorQueryResult[]): string {
  if (results.length === 0) {
    return "未找到相关文档。";
  }
  
  return results.map((result, index) => {
    const { document, score } = result;
    
    return `
[文档 ${index + 1}] 相关度: ${(score * 100).toFixed(2)}%
标题: ${document.title || '未知'}
来源: ${document.source || '未知'}
链接: ${document.url || '无链接'}
内容:
${document.content || '无内容'}
-------------------`;
  }).join('\n');
}

/**
 * 格式化为Markdown格式
 */
export function formatQueryResultsMarkdown(results: VectorQueryResult[]): string {
  if (results.length === 0) {
    return "未找到相关文档。";
  }
  
  return results.map((result, index) => {
    const { document, score } = result;
    
    return `
### 文档 ${index + 1} (相关度: ${(score * 100).toFixed(2)}%)

**标题**: ${document.title || '未知'}  
**来源**: ${document.source || '未知'}  
**链接**: ${document.url || '无链接'}

**内容**:
\`\`\`
${document.content || '无内容'}
\`\`\`
`;
  }).join('\n');
}

/**
 * 格式化为简洁文本（仅包含核心内容）
 */
export function formatQueryResultsCompact(results: VectorQueryResult[]): string {
  if (results.length === 0) {
    return "未找到相关文档。";
  }
  
  return results.map((result, index) => {
    const { document, score } = result;
    
    // 截取内容（最多300个字符）
    const content = document.content || '无内容';
    const truncatedContent = content.length > 300 
      ? content.substring(0, 300) + '...' 
      : content;
    
    return `[${index + 1}] ${document.title || '未知'} (相关度: ${(score * 100).toFixed(1)}%)
${truncatedContent}`;
  }).join('\n\n');
}

/**
 * 格式化为JSON字符串
 */
export function formatQueryResultsJson(results: VectorQueryResult[]): string {
  const formatted = results.map(result => ({
    title: result.document.title,
    source: result.document.source,
    url: result.document.url,
    content: result.document.content,
    similarity: result.score
  }));
  
  return JSON.stringify(formatted, null, 2);
}

/**
 * 格式化Agent响应
 * 为Mastra工具提供兼容接口
 */
export function formatAgentResponseRag(
  context: { 
    input?: { 
      query?: string 
    } 
  }, 
  results: Array<{ 
    metadata?: { 
      id?: string;
      title?: string;
      url?: string;
      source?: string;
      content?: string;
    }; 
    score?: number;
  }>
): string {
  // 从上下文中获取查询
  const query = context.input?.query || "未指定查询";
  
  // 格式化查询结果
  let formattedResults: string;
  
  if (Array.isArray(results) && results.length > 0) {
    // 转换为VectorQueryResult格式
    const vectorResults: VectorQueryResult[] = results.map(r => ({
      document: {
        id: r.metadata?.id || '',
        title: r.metadata?.title || '',
        url: r.metadata?.url || '',
        source: r.metadata?.source || '',
        content: r.metadata?.content || '',
        category: 'documentation',
        createdAt: Date.now()
      },
      score: r.score || 0
    }));
    
    formattedResults = formatQueryResults(vectorResults);
  } else {
    formattedResults = "未找到相关文档。";
  }
  
  return `## RAG查询结果: "${query}"

${formattedResults}

请基于以上文档内容回答用户的问题。如果以上文档无法充分回答问题，请结合你对CKB的知识提供尽可能准确的回答。`;
} 