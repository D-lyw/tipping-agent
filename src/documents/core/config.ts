/**
 * CKB生态文档处理模块 - 配置
 * 
 * 集中管理CKB文档处理模块的配置
 */

import * as dotenv from 'dotenv';
import { DocumentSource } from './types';

// 加载环境变量
dotenv.config();

// -----------------------------
// 向量存储配置
// -----------------------------

// OpenAI配置
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

// PostgreSQL向量数据库配置
export const PG_CONNECTION_STRING = process.env.POSTGRES_CONNECTION_STRING || '';
export const PG_VECTOR_TABLE = process.env.VECTOR_INDEX_NAME || 'document_embeddings';

// 批处理通用配置
export const DEFAULT_BATCH_SIZE = parseInt(process.env.DEFAULT_BATCH_SIZE || '20', 10);
export const DEFAULT_PROCESSING_INTERVAL = parseInt(process.env.DEFAULT_PROCESSING_INTERVAL || '100', 10);

// -----------------------------
// 抓取器配置
// -----------------------------

// GitHub API配置
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const USE_GITHUB_AUTH = GITHUB_TOKEN.length > 0;
export const GITHUB_MAX_RETRIES = 3;
export const GITHUB_RETRY_DELAY = 1000; // 毫秒

// GitHub抓取器配置
export const GITHUB_MAX_DEPTH = parseInt(process.env.GITHUB_MAX_DEPTH || '3', 10);
export const GITHUB_CHUNK_BATCH_SIZE = parseInt(process.env.GITHUB_CHUNK_BATCH_SIZE || '50', 10);
export const GITHUB_LIMIT_FILES = process.env.GITHUB_LIMIT_FILES === 'true'; 
export const GITHUB_SKIP_CODE = process.env.GITHUB_SKIP_CODE === 'true';
export const GITHUB_ONLY_DIRS = process.env.GITHUB_ONLY_DIRS ? process.env.GITHUB_ONLY_DIRS.split(',') : [];

// 本地文件抓取器配置
export const FILE_CHUNK_BATCH_SIZE = parseInt(process.env.FILE_CHUNK_BATCH_SIZE || '20', 10);
export const FILE_MAX_FILES_PER_BATCH = parseInt(process.env.FILE_MAX_FILES_PER_BATCH || '10', 10);
export const FILE_MAX_FILES_PER_DIR = parseInt(process.env.FILE_MAX_FILES_PER_DIR || '200', 10);
export const FILE_MAX_SIZE_KB = parseInt(process.env.FILE_MAX_SIZE_KB || '500', 10);
export const FILE_MAX_DIRS = parseInt(process.env.FILE_MAX_DIRS || '20', 10);

// 网站抓取器配置
export const WEBSITE_CHUNK_BATCH_SIZE = parseInt(process.env.WEBSITE_CHUNK_BATCH_SIZE || '10', 10);

// Firecrawl API配置
export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';
export const USE_FIRECRAWL = FIRECRAWL_API_KEY.length > 0;
export const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

// 文档处理器配置
export const PROCESSOR_BATCH_SIZE = parseInt(process.env.PROCESSOR_BATCH_SIZE || '20', 10);
export const PROCESSOR_INTERVAL = parseInt(process.env.PROCESSOR_INTERVAL || '50', 10);

// 网络请求配置
export const DEFAULT_REQUEST_TIMEOUT = 20000; // 毫秒
export const MAX_REDIRECTS = 5;

// 文档处理配置
export const DEFAULT_CHUNK_SIZE = 1000; // 字符
export const MIN_CHUNK_LENGTH = 20; // 字符

// 临时文件配置
export const TEMP_DIR = './tmp';
export const GITHUB_REPOS_DIR = `${TEMP_DIR}/github-repos`;

// 忽略的GitHub目录和文件
export const IGNORED_GITHUB_DIRS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.cache',
  'public'
];

export const IGNORED_GITHUB_FILES = [
  '.gitignore',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock'
];

// 支持的代码文件扩展名
export const CODE_EXTENSIONS = [
  // 常见编程语言
  '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rb',
  '.rs', '.scala', '.php', '.swift', '.kt', '.kts', '.sh', '.bash', '.pl', '.pm', '.r',
  // 标记文档
  '.md', '.markdown', '.rst', '.adoc',
  // 配置文件
  '.json', '.yaml', '.yml', '.toml', '.ini',
  // 智能合约
  '.sol', '.mol', '.capsule'
];

// CKB文档源
export const CKB_DOCUMENT_SOURCES: DocumentSource[] = [
  {
    name: 'Nervos CKB 文档',
    url: 'https://docs.nervos.org',
    type: 'website',
    selector: 'article',
    enabled: true
  },
  {
    name: 'Nervos RFCs',
    url: 'https://github.com/nervosnetwork/rfcs',
    type: 'github',
    enabled: true
  },
  {
    name: "Nervos RFCs 文章",
    url: "https://docs.ckb.dev/docs/rfcs/introduction",
    type: "website",
    selector: 'article',
    enabled: true
  },
  {
    name: 'CKB 开发者文档',
    url: 'https://docs.nervos.org/docs/getting-started/how-ckb-works',
    type: 'website',
    selector: '.markdown',
    enabled: true
  },
  // ckb-devrel/ccc
  {
    name: "CKB CCC",
    url: "https://github.com/ckb-devrel/ccc",
    type: 'github',
    enabled: true
  },
  // spore-dob-0
  {
    name: "Spore Dob 0 Protocol",
    url: "https://github.com/sporeprotocol/spore-dob-0",
    type: 'github',
    enabled: true
  },
  // spore-sdk
  {
    name: "Spore SDK",
    url: "https://github.com/sporeprotocol/spore-sdk",
    type: 'github',
    enabled: true
  },
  // spore docs
  {
    name: "Spore Docs",
    url: "https://docs.spore.pro/",
    type: 'website',
    enabled: true
  },
  // fiber
  {
    name: "Fiber",
    url: "https://github.com/nervosnetwork/fiber",
    type: 'github',
    enabled: true
  },
  // utxostack rgb++ design
  {
    name: "RGB++ Design",
    url: "https://github.com/utxostack/RGBPlusPlus-design",
    type: 'github',
    enabled: true
  },
  // rgb++ sdk
  {
    name: "RGB++ SDK",
    url: "https://github.com/utxostack/rgbpp-sdk",
    type: 'github',
    enabled: true
  }
];

// 默认HTTP请求头
export const DEFAULT_HTTP_HEADERS = {
  'User-Agent': 'CKB-Doc-Bot/1.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// 默认GitHub API请求头
export function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'CKB-Doc-Bot/1.0',
    'Accept': 'application/vnd.github.v3+json'
  };
  
  if (USE_GITHUB_AUTH) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  
  return headers;
} 