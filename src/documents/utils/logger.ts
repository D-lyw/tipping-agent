/**
 * CKB生态文档处理模块 - 日志工具
 * 
 * 提供结构化的日志记录功能
 */

import { LogLevel } from '../core/types';

/**
 * 日志条目接口
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

/**
 * 日志记录选项
 */
interface LogOptions {
  /** 是否启用控制台输出 */
  enableConsole: boolean;
  /** 是否启用详细模式 */
  verbose: boolean;
  /** 最低日志级别 */
  minLevel: LogLevel;
}

// 默认日志选项
const defaultOptions: LogOptions = {
  enableConsole: true,
  verbose: process.env.NODE_ENV !== 'production',
  minLevel: LogLevel.INFO
};

// 当前日志选项
let logOptions: LogOptions = { ...defaultOptions };

/**
 * 配置日志系统
 */
export function configureLogger(options: Partial<LogOptions>): void {
  logOptions = { ...logOptions, ...options };
}

/**
 * 格式化日志条目为字符串
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, level, module, message, data } = entry;
  
  let logMessage = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
  
  if (data && logOptions.verbose) {
    if (data instanceof Error) {
      logMessage += `\n${data.stack || data.message}`;
    } else {
      try {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
      } catch (e) {
        logMessage += `\n[不可序列化的数据]`;
      }
    }
  }
  
  return logMessage;
}

/**
 * 创建日志条目
 */
function createLogEntry(level: LogLevel, module: string, message: string, data?: any): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    data
  };
}

/**
 * 记录日志
 */
function log(level: LogLevel, module: string, message: string, data?: any): void {
  // 检查日志级别
  const levelOrder = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3
  };
  
  if (levelOrder[level] < levelOrder[logOptions.minLevel]) {
    return;
  }
  
  const entry = createLogEntry(level, module, message, data);
  
  if (logOptions.enableConsole) {
    const formattedEntry = formatLogEntry(entry);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedEntry);
        break;
      case LogLevel.INFO:
        console.info(formattedEntry);
        break;
      case LogLevel.WARN:
        console.warn(formattedEntry);
        break;
      case LogLevel.ERROR:
        console.error(formattedEntry);
        break;
    }
  }
  
  // 未来可扩展：将日志写入文件、发送到日志服务等
}

/**
 * 创建特定模块的日志记录器
 */
export function createLogger(moduleName: string) {
  return {
    debug: (message: string, data?: any) => log(LogLevel.DEBUG, moduleName, message, data),
    info: (message: string, data?: any) => log(LogLevel.INFO, moduleName, message, data),
    warn: (message: string, data?: any) => log(LogLevel.WARN, moduleName, message, data),
    error: (message: string, data?: any) => log(LogLevel.ERROR, moduleName, message, data)
  };
} 