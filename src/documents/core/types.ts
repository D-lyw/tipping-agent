/**
 * CKB生态文档处理模块 - 核心类型定义
 */

/**
 * 文档源定义接口
 * 定义了文档的来源、类型和抓取方式
 */
export interface DocumentSource {
  /** 数据源名称 */
  name: string;
  /** 数据源URL地址 */
  url: string;
  /** 数据源类型: 网站, GitHub仓库, 或本地文件 */
  type: 'website' | 'github' | 'file';
  /** CSS选择器，用于网站内容抓取 */
  selector?: string;
  /** 是否启用该数据源 */
  enabled?: boolean;
  /** 本地文件路径，仅用于file类型 */
  filePath?: string;
  /** 文件类型，仅用于file类型 */
  fileType?: 'text' | 'markdown' | 'pdf';
}

/**
 * 文档片段接口
 * 表示经过处理的单个文档片段，用于存储和检索
 */
export interface DocumentChunk {
  /** 唯一标识符 */
  id: string;
  /** 文档内容 */
  content: string;
  /** 文档标题 */
  title: string;
  /** 文档URL或来源地址 */
  url: string;
  /** 文档来源名称 */
  source: string;
  /** 文档分类 */
  category: string;
  /** 创建时间戳 */
  createdAt?: number;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 抓取结果接口
 * 用于统一不同抓取器的返回结果
 */
export interface ScrapingResult {
  /** 操作是否成功 */
  success: boolean;
  /** 文档片段列表 */
  chunks: DocumentChunk[];
  /** 错误信息（如果有） */
  error?: Error;
  /** 状态消息 */
  message?: string;
  /** 统计信息 */
  stats?: {
    /** 抓取的文档数量 */
    totalChunks: number;
    /** 抓取的页面数量 */
    totalPages?: number;
    /** 抓取耗时(毫秒) */
    timeMs: number;
  };
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 诊断结果接口
 */
export interface DiagnosticResult {
  /** 状态: 正常, 警告 或 错误 */
  status: 'ok' | 'warning' | 'error';
  /** 诊断消息 */
  message: string;
  /** 统计信息 */
  stats: {
    /** 总文档数 */
    total: number;
    /** 按来源分类的统计 */
    bySource: Record<string, number>;
    /** 按分类统计 */
    byCategory: Record<string, number>;
  };
} 