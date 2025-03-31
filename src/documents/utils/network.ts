/**
 * CKB生态文档处理模块 - 网络请求工具
 * 
 * 提供网络请求相关的工具函数
 */

import * as axios from 'axios';
import { createLogger } from './logger.js';
import { delay } from './helpers';
import { 
  createNetworkError, 
  ErrorType, 
  handleError, 
  safeExecute,
  wrapError 
} from './errors.js';
import { DEFAULT_HTTP_HEADERS, DEFAULT_REQUEST_TIMEOUT, MAX_REDIRECTS } from '../core/config.js';

// 初始化日志记录器
const logger = createLogger('Network');

/**
 * 重试配置接口
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始重试延迟（毫秒） */
  initialDelay: number;
  /** 重试延迟倍数（用于指数退避） */
  delayFactor: number;
  /** 是否包含API速率限制错误 */
  includeRateLimitErrors: boolean;
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  delayFactor: 2,
  includeRateLimitErrors: true
};

/**
 * 判断是否为API速率限制错误
 */
function isRateLimitError(error: axios.AxiosError): boolean {
  return !!(
    error.response && 
    error.response.status === 429 || 
    (error.response?.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0')
  );
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  // 不是AxiosError的错误不重试
  if (!axios.isAxiosError(error)) {
    return false;
  }
  
  const axiosError = error as axios.AxiosError;
  
  // 网络错误或特定HTTP状态码可以重试
  if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT' || !axiosError.response) {
    return true;
  }
  
  // 速率限制错误
  if (config.includeRateLimitErrors && isRateLimitError(axiosError)) {
    return true;
  }
  
  // 服务器错误（5xx）可以重试
  if (axiosError.response && axiosError.response.status >= 500 && axiosError.response.status < 600) {
    return true;
  }
  
  return false;
}

/**
 * 带重试机制的HTTP请求
 */
export async function fetchWithRetry<T = any>(
  url: string, 
  options: axios.AxiosRequestConfig,
  retryConfig: Partial<RetryConfig> = {}
): Promise<axios.AxiosResponse<T>> {
  // 合并重试配置
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...retryConfig
  };
  
  // 重试计数
  let retryCount = 0;
  // 当前延迟
  let currentDelay = config.initialDelay;
  
  while (true) {
    try {
      logger.debug(`请求 ${url}, 重试次数: ${retryCount}`);
      return await axios(url, options);
    } catch (error) {
      // 如果是可重试错误，并且还有重试次数
      if (isRetryableError(error, config) && retryCount < config.maxRetries) {
        retryCount++;
        
        // 是否为速率限制错误
        const isRateLimit = axios.isAxiosError(error) && isRateLimitError(error as axios.AxiosError);
        
        // 对于速率限制错误，使用更长的延迟
        const delayTime = isRateLimit ? currentDelay * 2 : currentDelay;
        
        logger.warn(
          `请求失败 (${isRateLimit ? '速率限制' : '网络错误'}), 将在 ${delayTime}ms 后重试 (${retryCount}/${config.maxRetries})`, 
          { url, error: axios.isAxiosError(error) ? error.message : String(error) }
        );
        
        // 等待后重试
        await delay(delayTime);
        
        // 增加下次重试延迟（指数退避）
        currentDelay *= config.delayFactor;
      } else {
        // 无法重试，抛出错误
        if (axios.isAxiosError(error)) {
          const axiosError = error as axios.AxiosError;
          if (isRateLimitError(axiosError)) {
            throw createNetworkError(`API速率限制错误: ${axiosError.message}`, axiosError as any);
          } else if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
            throw createNetworkError(`请求超时: ${axiosError.message}`, axiosError as any);
          } else if (axiosError.response) {
            throw createNetworkError(`HTTP错误 ${axiosError.response.status}: ${axiosError.message}`, axiosError as any);
          }
        }
        
        // 其他错误
        throw wrapError(error, '网络请求失败');
      }
    }
  }
}

/**
 * 安全的HTTP GET请求
 */
export async function safeGet<T = any>(url: string, options: axios.AxiosRequestConfig = {}): Promise<T> {
  return await safeExecute(async () => {
    const response = await fetchWithRetry<T>(url, {
      method: 'GET',
      ...options
    });
    return response.data;
  });
}

/**
 * 安全的HTTP POST请求
 */
export async function safePost<T = any, D = any>(url: string, data?: D, options: axios.AxiosRequestConfig = {}): Promise<T> {
  return await safeExecute(async () => {
    const response = await fetchWithRetry<T>(url, {
      method: 'POST',
      data,
      ...options
    });
    return response.data;
  });
} 