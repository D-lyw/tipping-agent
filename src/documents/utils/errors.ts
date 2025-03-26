/**
 * CKB生态文档处理模块 - 错误处理工具
 * 
 * 提供统一的错误类型和错误处理函数
 */

import { createLogger } from './logger.js';

const logger = createLogger('ErrorHandler');

/**
 * 错误类型枚举
 */
export enum ErrorType {
  // 网络错误
  NETWORK_ERROR = 'NETWORK_ERROR',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  
  // 数据处理错误
  PARSING_ERROR = 'PARSING_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // 资源错误
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // 系统错误
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // 外部服务错误
  FIRECRAWL_API_ERROR = 'FIRECRAWL_API_ERROR',
  GITHUB_API_ERROR = 'GITHUB_API_ERROR',
  DB_ERROR = 'DB_ERROR',
  
  // 其他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 文档处理错误类
 * 扩展自Error，添加更多上下文信息
 */
export class DocumentProcessingError extends Error {
  /** 错误类型 */
  type: ErrorType;
  /** 错误代码 */
  code?: string;
  /** 错误原因（原始错误） */
  cause?: Error;
  /** 上下文信息 */
  context?: Record<string, any>;
  /** 是否已处理 */
  handled: boolean = false;
  
  constructor(message: string, options: {
    type: ErrorType,
    code?: string,
    cause?: Error,
    context?: Record<string, any>
  }) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.type = options.type;
    this.code = options.code;
    this.cause = options.cause;
    this.context = options.context;
    
    // 确保堆栈跟踪包含此构造函数调用
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocumentProcessingError);
    }
  }
}

/**
 * 创建网络错误
 */
export function createNetworkError(message: string, cause?: Error, context?: Record<string, any>): DocumentProcessingError {
  return new DocumentProcessingError(message, {
    type: ErrorType.NETWORK_ERROR,
    cause,
    context
  });
}

/**
 * 创建GitHub API错误
 */
export function createGitHubApiError(message: string, code?: string, cause?: Error, context?: Record<string, any>): DocumentProcessingError {
  return new DocumentProcessingError(message, {
    type: ErrorType.GITHUB_API_ERROR,
    code,
    cause,
    context
  });
}

/**
 * 创建Firecrawl API错误
 */
export function createFirecrawlApiError(message: string, cause?: Error, context?: Record<string, any>): DocumentProcessingError {
  return new DocumentProcessingError(message, {
    type: ErrorType.FIRECRAWL_API_ERROR,
    cause,
    context
  });
}

/**
 * 创建资源未找到错误
 */
export function createResourceNotFoundError(message: string, context?: Record<string, any>): DocumentProcessingError {
  return new DocumentProcessingError(message, {
    type: ErrorType.RESOURCE_NOT_FOUND,
    context
  });
}

/**
 * 创建配置错误
 */
export function createConfigurationError(message: string, context?: Record<string, any>): DocumentProcessingError {
  return new DocumentProcessingError(message, {
    type: ErrorType.CONFIGURATION_ERROR,
    context
  });
}

/**
 * 包装原始错误为文档处理错误
 */
export function wrapError(error: unknown, defaultMessage: string = '发生未知错误'): DocumentProcessingError {
  if (error instanceof DocumentProcessingError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new DocumentProcessingError(error.message || defaultMessage, {
      type: ErrorType.UNKNOWN_ERROR,
      cause: error
    });
  }
  
  return new DocumentProcessingError(
    typeof error === 'string' ? error : defaultMessage, 
    { type: ErrorType.UNKNOWN_ERROR }
  );
}

/**
 * 错误处理函数
 * 记录错误日志并根据需要执行其他操作
 */
export function handleError(error: unknown, context?: Record<string, any>): DocumentProcessingError {
  const processedError = wrapError(error);
  
  if (processedError.handled) {
    return processedError;
  }
  
  // 合并上下文
  if (context) {
    processedError.context = {
      ...processedError.context,
      ...context
    };
  }
  
  // 记录错误日志
  logger.error(processedError.message, {
    errorType: processedError.type,
    errorCode: processedError.code,
    cause: processedError.cause?.message,
    context: processedError.context,
    stack: processedError.stack
  });
  
  // 标记为已处理
  processedError.handled = true;
  
  return processedError;
}

/**
 * 安全执行函数，捕获错误并使用errorHandler处理
 */
export async function safeExecute<T, E = DocumentProcessingError>(
  fn: () => Promise<T>,
  errorHandler?: (error: E) => T | Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorHandler) {
      return errorHandler(error as E);
    }
    throw error;
  }
} 