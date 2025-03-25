/**
 * CKB生态文档处理模块 - 主入口
 * 
 * 导出所有模块和类型
 */

// 核心类型和配置
export * from './core/types';
export * from './core/config';
export * from './core/manager';

// 抓取器
export { scrapeWebsite, scrapeWebsiteOriginal, scrapeWebsiteWithFirecrawl } from './scrapers/website';
export { scrapeGitHubRepo } from './scrapers/github';
export { processLocalFile, processLocalDirectory } from './scrapers/file';

// 处理器
export { chunkDocument, optimizeChunks } from './processors/chunker';
export type { ChunkingOptions } from './processors/chunker';

// 存储
export { MastraVectorStore } from './storage/mastra-vector-store';
export type { 
  VectorStoreConfig, 
  VectorQueryOptions, 
  VectorQueryResult 
} from './storage/mastra-vector-store';

// RAG系统
export {
  queryDocuments,
  indexAllDocuments,
  rebuildIndex,
  addCustomDocument,
  getVectorStore
} from './rag/query';

export {
  formatQueryResults,
  formatQueryResultsMarkdown,
  formatQueryResultsCompact,
  formatQueryResultsJson,
  formatAgentResponseRag
} from './rag/formatting';

// 工具函数
export { 
  createLogger,
  configureLogger
} from './utils/logger';

export {
  DocumentProcessingError,
  ErrorType,
  handleError,
  safeExecute,
  wrapError,
  createNetworkError,
  createGitHubApiError,
  createFirecrawlApiError,
  createResourceNotFoundError,
  createConfigurationError
} from './utils/errors';

export {
  generateId,
  createDocumentId,
  delay,
  sanitizeText,
  extractDomain,
  splitIntoParagraphs,
  splitIntoChunks,
  parseGitHubUrl
} from './utils/helpers';

export {
  fetchWithRetry,
  safeGet,
  safePost,
} from './utils/network';
export type { RetryConfig } from './utils/network';

/**
 * 创建文档管理器实例
 */
import { DocumentManager, DocumentManagerOptions } from './core/manager';

export function createDocumentManager(options?: DocumentManagerOptions): DocumentManager {
  return new DocumentManager(options);
} 