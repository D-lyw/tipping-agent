/**
 * CKB生态文档处理模块 - GitHub仓库抓取器
 * 支持流式处理
 */

import * as path from 'path';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types.js';
import { createLogger } from '../utils/logger.js';
import { createDocumentId, parseGitHubUrl, splitIntoChunks, delay } from '../utils/helpers.js';
import { 
  createGitHubApiError, 
  createResourceNotFoundError, 
  DocumentProcessingError, 
  safeExecute 
} from '../utils/errors.js';
import { 
  getGitHubHeaders, 
  MIN_CHUNK_LENGTH,
  CODE_EXTENSIONS,
  IGNORED_GITHUB_DIRS,
  IGNORED_GITHUB_FILES,
  OPENAI_API_KEY,
  PG_CONNECTION_STRING,
  PG_VECTOR_TABLE,
  GITHUB_MAX_DEPTH,
  GITHUB_CHUNK_BATCH_SIZE,
  GITHUB_LIMIT_FILES,
  GITHUB_SKIP_CODE,
  GITHUB_ONLY_DIRS
} from '../core/config.js';
import { fetchWithRetry } from '../utils/network.js';
import { DocumentChunkProcessor } from './website.js';
import { MastraVectorStore } from '../storage/mastra-vector-store.js';
import * as dotenv from 'dotenv';
import { MemoryManager } from '../../utils/memory.js';

// 加载环境变量
dotenv.config();

// 初始化日志记录器
const logger = createLogger('GitHubScraper');

// 更新GitHub爬取配置
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_CHUNK_BATCH_SIZE = 20; // 从50减少到20
const DEFAULT_LIMIT_FILES = false;
const DEFAULT_SKIP_CODE = false;
const DEFAULT_IMPORTANT_DIRS: string[] = [];

// 读取环境变量配置
const maxDepth = parseInt(process.env.GITHUB_MAX_DEPTH || `${DEFAULT_MAX_DEPTH}`, 10);
const chunkBatchSize = parseInt(process.env.GITHUB_CHUNK_BATCH_SIZE || `${DEFAULT_CHUNK_BATCH_SIZE}`, 10);
const limitFiles = process.env.GITHUB_LIMIT_FILES === 'true' || DEFAULT_LIMIT_FILES;
const skipCode = process.env.GITHUB_SKIP_CODE === 'true' || DEFAULT_SKIP_CODE;
const onlyDirs = process.env.GITHUB_ONLY_DIRS ? process.env.GITHUB_ONLY_DIRS.split(',') : DEFAULT_IMPORTANT_DIRS;

logger.info(`GitHub抓取器配置: 最大深度=${maxDepth}, 块批处理大小=${chunkBatchSize}, 限制文件=${limitFiles}, 跳过代码=${skipCode}`);
if (onlyDirs.length > 0) {
  logger.info(`只处理以下目录: ${onlyDirs.join(', ')}`);
}

/**
 * GitHub仓库文件信息接口
 */
interface GitHubFileInfo {
  name: string;
  path: string;
  type: 'file' | 'dir';
  html_url: string;
  download_url?: string;
  size?: number;
}

/**
 * 统计信息接口
 */
interface GitHubScrapingStats {
  totalFiles: number;
  processedFiles: number;
  totalDirectories: number;
  processedMarkdownFiles: number;
  processedCodeFiles: number;
  totalChunks: number;
  storedChunks: number;
  timeMs: number;
  pendingChunks: number; // 添加跟踪等待处理的文档块数量
}

/**
 * GitHub仓库抓取选项
 */
export interface GitHubScrapingOptions {
  maxDepth?: number;
  chunkBatchSize?: number;
  limitFiles?: boolean;
  skipCode?: boolean;
  onlyDirs?: string[];
}

/**
 * 文档块处理函数类型
 */
export type DocumentChunkHandler = (chunks: DocumentChunk[]) => Promise<void>;

/**
 * 从GitHub仓库抓取内容，直接进行向量存储
 * @param source 文档源
 * @returns 抓取结果
 */
export async function scrapeGitHubRepo(
  source: DocumentSource,
  options: GitHubScrapingOptions = {},
  chunkHandler?: DocumentChunkHandler
): Promise<ScrapingResult> {
  const memoryManager = MemoryManager.getInstance();
  memoryManager.checkMemory('开始爬取GitHub仓库');
  
  // 从source中获取repoUrl
  const repoUrl = source.url;
  
  logger.info(`抓取GitHub仓库: ${repoUrl}`);
  const startTime = Date.now();
  
  // 初始化统计信息
  const stats: GitHubScrapingStats = {
    totalFiles: 0,
    processedFiles: 0,
    totalDirectories: 0,
    processedMarkdownFiles: 0,
    processedCodeFiles: 0,
    totalChunks: 0,
    storedChunks: 0,
    timeMs: 0,
    pendingChunks: 0
  };
  
  // 内存中积累的文档块
  const pendingChunks: DocumentChunk[] = [];
  
  // 初始化向量存储
  let vectorStore: MastraVectorStore | null = null;
  try {
    // 初始化向量存储
    if (!OPENAI_API_KEY) {
      logger.warn('未设置OpenAI API密钥，向量化将无法正常工作');
    }
    
    if (!PG_CONNECTION_STRING) {
      logger.warn('未设置PG_CONNECTION_STRING，向量存储将无法正常工作');
    }
    
    vectorStore = new MastraVectorStore({
      apiKey: OPENAI_API_KEY,
      pgConnectionString: PG_CONNECTION_STRING,
      tablePrefix: PG_VECTOR_TABLE,
      batchSize: 50
    });
    
    const initialized = await vectorStore.initialize();
    if (!initialized) {
      logger.error('向量存储初始化失败');
      return {
        success: false,
        chunks: [],
        message: '向量存储初始化失败',
        stats: {
          totalChunks: 0,
          totalPages: 0,
          timeMs: Date.now() - startTime
        }
      };
    }
    
    logger.info('向量存储初始化成功，开始处理GitHub仓库');
  } catch (error) {
    logger.error('初始化向量存储时出错:', error);
    return {
      success: false,
      chunks: [],
      message: `初始化向量存储失败: ${error.message}`,
      stats: {
        totalChunks: 0,
        totalPages: 0,
        timeMs: Date.now() - startTime
      }
    };
  }
  
  // 内部函数，处理文档块
  const handleChunks = async (chunks: DocumentChunk[]): Promise<void> => {
    if (!chunks || chunks.length === 0) return;
    
    // 更新统计信息
    stats.totalChunks += chunks.length;
    
    // 添加到待处理队列
    pendingChunks.push(...chunks);
    stats.pendingChunks = pendingChunks.length;
    
    // 当待处理队列达到批次大小时处理
    if (pendingChunks.length >= chunkBatchSize) {
      const batchToProcess = pendingChunks.splice(0, chunkBatchSize);
      stats.pendingChunks = pendingChunks.length;
      
      logger.info(`处理文档块批次: ${batchToProcess.length}个块`);
      await processAccumulatedChunks(batchToProcess);
      
      // 尝试垃圾回收
      memoryManager.tryGC();
    }
  };
  
  // 处理积累的文档块
  const processAccumulatedChunks = async (chunks: DocumentChunk[]): Promise<void> => {
    if (chunks.length === 0 || !vectorStore) return;
    
    logger.info(`向量化并存储 ${chunks.length} 个文档块...`);
    
    try {
      // 小批次处理，避免一次性处理过多文档导致内存溢出
      const batchSize = 20; // 更小的批次大小
      let processedCount = 0;
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const currentBatch = chunks.slice(i, i + batchSize);
        
        // 存储文档
        const startTime = Date.now();
        const storedCount = await vectorStore.storeDocuments(currentBatch);
        const endTime = Date.now();
        
        processedCount += storedCount;
        logger.info(`成功向量化并存储批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}, ` +
                   `${storedCount}/${currentBatch.length} 个文档块，耗时 ${endTime - startTime}ms`);
        
        // 每处理一个批次后释放内存
        currentBatch.length = 0;
        
        // 强制进行垃圾回收
        if (global.gc) {
          try {
            global.gc();
            logger.debug('执行垃圾回收');
          } catch (e) {
            // 忽略错误
          }
        }
        
        // 在批次之间添加小延迟，让JavaScript引擎有时间整理内存
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      stats.storedChunks += processedCount;
      logger.info(`本次批次处理完成，成功向量化并存储 ${processedCount}/${chunks.length} 个文档块`);
      
      // 释放大数组的内存
      chunks.length = 0;
      
      // 再次强制进行垃圾回收
      if (global.gc) {
        try {
          global.gc();
          logger.info('批次处理完成后执行垃圾回收');
        } catch (e) {
          // 忽略错误
        }
      }
    } catch (error) {
      logger.error('向量化和存储文档时出错:', error);
      
      // 释放内存
      chunks.length = 0;
    }
  };
  
  // 使用safeExecute包装执行过程
  return await safeExecute<ScrapingResult>(async () => {
    // 解析GitHub URL
    const repoInfo = parseGitHubUrl(repoUrl);
    if (!repoInfo) {
      throw createResourceNotFoundError(`无效的GitHub仓库URL: ${repoUrl}`);
    }
    
    const { owner, repo } = repoInfo;
    logger.info(`解析仓库信息: ${owner}/${repo}`);
    
    // 获取仓库默认分支
    const defaultBranch = await getDefaultBranch(owner, repo);
    logger.info(`仓库 ${owner}/${repo} 的默认分支为: ${defaultBranch}`);
    
    // 首先，获取README文件
    try {
      const readmeContent = await getRepositoryReadme(owner, repo, defaultBranch);
      if (readmeContent) {
        logger.info(`成功获取 ${owner}/${repo} 的README文件`);
        
        // 处理README内容
        const readmeChunks = processGitHubMarkdown(
          readmeContent.content,
          'README',
          readmeContent.html_url,
          source.name,
          'readme'
        );
        
        stats.processedMarkdownFiles++;
        stats.processedFiles++;
        
        // 处理README文档块
        await handleChunks(readmeChunks);
      }
    } catch (error) {
      logger.warn(`获取README失败: ${error.message}`);
    }
    
    // 处理累积的块
    await processAccumulatedChunks(pendingChunks);
    
    // 获取目录列表，优先处理指定目录
    if (onlyDirs.length > 0) {
      logger.info(`按指定顺序处理目录: ${onlyDirs.join(', ')}`);
      
      // 只处理ONLY_DIRS中指定的目录
      for (const dirPath of onlyDirs) {
        try {
          // 使用流式处理目录
          await processDirectoryStream(
            owner, repo, defaultBranch, dirPath, handleChunks, source.name, stats, 0
          );
          
          // 每处理完一个目录后，处理积累的文档块
          await processAccumulatedChunks(pendingChunks);
        } catch (error) {
          // 忽略目录不存在的错误
          if (!(error instanceof DocumentProcessingError && 
                error.message.includes('目录不存在'))) {
            logger.warn(`处理 ${dirPath} 目录时出错: ${error.message}`);
          }
        }
      }
    } else {
      // 然后，获取其他重要文档目录
      const docsDirectories = ['docs', 'doc', 'documentation', 'wiki', 'specs', 'rfcs'];
      
      for (const docsDir of docsDirectories) {
        try {
          // 使用流式处理目录
          await processDirectoryStream(
            owner, repo, defaultBranch, docsDir, handleChunks, source.name, stats, 0
          );
          
          // 每处理完一个目录后，处理积累的文档块
          await processAccumulatedChunks(pendingChunks);
        } catch (error) {
          // 忽略目录不存在的错误
          if (!(error instanceof DocumentProcessingError && 
                error.message.includes('目录不存在'))) {
            logger.warn(`处理 ${docsDir} 目录时出错: ${error.message}`);
          }
        }
      }
      
      // 最后，获取仓库根目录中的Markdown文件
      try {
        const rootFiles = await getRepositoryContents(owner, repo, defaultBranch, '');
        stats.totalFiles += rootFiles.filter(file => file.type === 'file').length;
        stats.totalDirectories += rootFiles.filter(file => file.type === 'dir').length;
        
        const markdownFiles = rootFiles.filter(file => 
          file.type === 'file' && 
          file.name.toLowerCase().endsWith('.md') &&
          file.name.toLowerCase() !== 'readme.md'
        );
        
        // 流式处理每个Markdown文件
        for (const mdFile of markdownFiles) {
          try {
            const fileContent = await getFileContent(owner, repo, defaultBranch, mdFile.path);
            if (fileContent) {
              const mdChunks = processGitHubMarkdown(
                fileContent,
                mdFile.name,
                mdFile.html_url,
                source.name,
                'documentation'
              );
              
              stats.processedMarkdownFiles++;
              stats.processedFiles++;
              
              // 处理文档块
              await handleChunks(mdChunks);
            }
          } catch (error) {
            logger.warn(`获取文件 ${mdFile.path} 失败: ${error.message}`);
          }
          
          // 防止API限制，延迟一小段时间
          await delay(500);
        }
        
        // 处理完根目录文件后，处理积累的文档块
        await processAccumulatedChunks(pendingChunks);
      } catch (error) {
        logger.warn(`获取根目录文件列表失败: ${error.message}`);
      }
    }
    
    // 如果是关键的CKB技术仓库，并且未配置跳过代码处理，才处理源代码和注释
    const isCkbRepo = repoUrl.includes('nervosnetwork') || 
                      repoUrl.includes('ckb-') || 
                      repoUrl.includes('sporeprotocol');
    
    if (isCkbRepo && !skipCode) {
      logger.info(`检测到关键CKB技术仓库，将分析源代码和注释`);
      try {
        // 获取源代码目录
        const srcDirs = ['src', 'lib', 'packages', 'core', 'modules'];
        for (const srcDir of srcDirs) {
          try {
            // 使用流式处理代码目录
            await processCodeDirectoryStream(
              owner, repo, defaultBranch, srcDir, handleChunks, source.name, stats, 0
            );
            
            // 每处理完一个目录后，处理积累的文档块
            await processAccumulatedChunks(pendingChunks);
          } catch (error) {
            // 忽略目录不存在的错误
            if (!(error instanceof DocumentProcessingError && 
                  error.message.includes('目录不存在'))) {
              logger.warn(`处理代码目录 ${srcDir} 时出错: ${error.message}`);
            }
          }
        }
      } catch (error) {
        logger.warn(`处理源代码时出错: ${error.message}`);
      }
    } else if (skipCode) {
      logger.info(`已配置跳过代码文件处理`);
    }
    
    // 在结束前，确保所有待处理的文档块都被处理
    await processAccumulatedChunks(pendingChunks);
    
    // 释放向量存储资源
    if (vectorStore) {
      try {
        await vectorStore.close();
      } catch (error) {
        logger.warn('关闭向量存储时出错:', error);
      }
    }
    
    stats.timeMs = Date.now() - startTime;
    logger.info(`从 ${repoUrl} 提取了 ${stats.totalChunks} 个文档片段，` +
      `成功存储了 ${stats.storedChunks} 个文档片段，` +
      `处理了 ${stats.processedFiles}/${stats.totalFiles} 个文件，` +
      `耗时 ${stats.timeMs}ms`);
    
    memoryManager.checkMemory('GitHub仓库爬取完成');
    memoryManager.printReport();
    
    return {
      success: true,
      chunks: [], // 使用向量存储直接处理，不返回文档块
      message: `成功抓取并存储GitHub仓库 ${repoUrl}`,
      stats: {
        totalChunks: stats.totalChunks,
        totalPages: stats.processedFiles,
        timeMs: stats.timeMs
      }
    };
  }, (error) => {
    // 确保在发生错误时也处理所有待处理的文档块
    if (pendingChunks.length > 0 && vectorStore) {
      processAccumulatedChunks(pendingChunks).catch(e => 
        logger.error(`处理剩余文档块时出错:`, e)
      );
    }
    
    // 关闭向量存储
    if (vectorStore) {
      vectorStore.close().catch(e => 
        logger.error('关闭向量存储时出错:', e)
      );
    }
    
    memoryManager.checkMemory('GitHub仓库爬取失败');
    memoryManager.printReport();
    
    return {
      success: false,
      chunks: [],
      error,
      message: `抓取 ${repoUrl} 失败: ${error.message}`,
      stats: {
        totalChunks: stats.totalChunks,
        totalPages: stats.processedFiles,
        timeMs: Date.now() - startTime
      }
    };
  });
}

/**
 * 获取仓库默认分支
 */
async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  try {
    // 尝试通过GitHub API获取仓库信息
    const repoInfoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await fetchWithRetry(repoInfoUrl, {
      headers: getGitHubHeaders(),
      timeout: 10000
    });
    
    if (response.status === 200 && response.data.default_branch) {
      return response.data.default_branch;
    }
    
    // 如果API没有返回默认分支，尝试常见分支名
    throw new Error('API未返回默认分支信息');
  } catch (error) {
    logger.warn(`无法通过API获取仓库 ${owner}/${repo} 的默认分支信息，将尝试常见分支名`);
    
    // 尝试常见的分支名
    const possibleBranches = ['main', 'master', 'develop', 'dev'];
    
    for (const branch of possibleBranches) {
      try {
        // 尝试获取分支的README
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/README.md?ref=${branch}`;
        const response = await fetchWithRetry(url, {
          headers: getGitHubHeaders(),
          timeout: 5000
        });
        
        if (response.status === 200) {
          logger.info(`找到有效分支: ${branch}`);
          return branch;
        }
      } catch (error) {
        // 忽略错误，继续尝试下一个分支
      }
    }
    
    // 如果所有分支都失败，默认返回'master'
    logger.warn(`无法确定默认分支，将使用'master'作为默认值`);
    return 'master';
  }
}

/**
 * 获取仓库README文件
 */
async function getRepositoryReadme(owner: string, repo: string, branch: string): Promise<{ content: string, html_url: string } | null> {
  try {
    // 尝试获取README文件
    const readmeUrl = `https://api.github.com/repos/${owner}/${repo}/readme?ref=${branch}`;
    const response = await fetchWithRetry(readmeUrl, {
      headers: getGitHubHeaders(),
      timeout: 10000
    });
    
    if (response.status === 200 && response.data.content) {
      // GitHub API返回的内容是Base64编码的
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return {
        content,
        html_url: response.data.html_url
      };
    }
    
    return null;
  } catch (error) {
    logger.warn(`获取README失败: ${error.message}`);
    return null;
  }
}

/**
 * 获取仓库目录内容
 */
async function getRepositoryContents(owner: string, repo: string, branch: string, path: string): Promise<GitHubFileInfo[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  
  try {
    const response = await fetchWithRetry(url, {
      headers: getGitHubHeaders(),
      timeout: 10000
    });
    
    if (response.status === 200) {
      if (Array.isArray(response.data)) {
        return response.data;
      } else {
        // 如果不是数组，可能是单个文件
        return [response.data];
      }
    }
    
    throw createResourceNotFoundError(`目录不存在: ${path}`);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw createResourceNotFoundError(`目录不存在: ${path}`);
    }
    throw error;
  }
}

/**
 * 获取文件内容
 */
async function getFileContent(owner: string, repo: string, branch: string, filePath: string): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const response = await fetchWithRetry(url, {
      headers: getGitHubHeaders(),
      timeout: 10000
    });
    
    if (response.status === 200 && response.data.content) {
      // GitHub API返回的内容是Base64编码的
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    
    return null;
  } catch (error) {
    logger.warn(`获取文件 ${filePath} 内容失败: ${error.message}`);
    return null;
  }
}

/**
 * 流式处理目录内容
 */
async function processDirectoryStream(
  owner: string, 
  repo: string, 
  branch: string, 
  dirPath: string, 
  chunkHandler: (chunks: DocumentChunk[]) => Promise<void>, 
  sourceName: string,
  stats: GitHubScrapingStats,
  depthLevel: number = 0
): Promise<void> {
  const memoryManager = MemoryManager.getInstance();
  
  if (depthLevel > maxDepth) {
    logger.info(`跳过深度超过${maxDepth}的目录: ${dirPath}`);
    return;
  }
  
  // 如果指定了只处理特定目录，检查当前目录是否在列表中
  if (onlyDirs.length > 0 && depthLevel === 0) {
    const dirName = path.basename(dirPath);
    if (!onlyDirs.includes(dirName)) {
      logger.info(`跳过非指定目录: ${dirName}`);
      return;
    }
    logger.info(`处理指定目录: ${dirName}`);
  }
  
  // 获取目录内容
  const contents = await getRepositoryContents(owner, repo, branch, dirPath);
  if (!contents || contents.length === 0) {
    throw createResourceNotFoundError(`目录 ${dirPath} 不存在或为空`);
  }
  
  // 更新统计信息
  stats.totalFiles += contents.filter(item => item.type === 'file').length;
  stats.totalDirectories += contents.filter(item => item.type === 'dir').length;
  
  // 处理目录中的Markdown文件
  const markdownFiles = contents.filter(item => 
    item.type === 'file' && 
    (item.name.toLowerCase().endsWith('.md') || 
     item.name.toLowerCase().endsWith('.markdown'))
  );
  
  // 处理文件计数器
  let processedFilesCount = 0;
  const BATCH_SIZE = 5; // 每处理5个文件触发一次GC
  
  // 先处理所有Markdown文件
  for (const mdFile of markdownFiles) {
    try {
      const content = await getFileContent(owner, repo, branch, mdFile.path);
      if (content) {
        // 处理Markdown内容并生成文档块
        const chunks = processGitHubMarkdown(
          content,
          mdFile.name,
          mdFile.html_url,
          sourceName,
          'documentation'
        );
        
        stats.processedMarkdownFiles++;
        stats.processedFiles++;
        processedFilesCount++;
        
        // 使用回调处理文档块
        await chunkHandler(chunks);
        
        // 输出处理进度
        if (stats.processedFiles % 5 === 0) {
          logger.info(`已处理 ${stats.processedFiles} 个文件，生成 ${stats.totalChunks} 个文档块`);
        }
        
        // 周期性尝试释放内存
        if (processedFilesCount % BATCH_SIZE === 0) {
          logger.info(`已处理 ${processedFilesCount} 个文件，尝试释放内存...`);
          memoryManager.tryGC();
        }
      }
    } catch (error) {
      logger.warn(`处理文件 ${mdFile.path} 时出错: ${error.message}`);
    }
    
    // 防止触发GitHub API限制，添加小延迟
    await delay(500);
  }
  
  // 递归处理子目录，但跳过忽略的目录
  const subDirs = contents.filter(item => 
    item.type === 'dir' && 
    !IGNORED_GITHUB_DIRS.includes(item.name.toLowerCase())
  );
  
  // 如果已经达到最大深度-1，只处理重要目录
  if (depthLevel >= maxDepth - 1) {
    const importantDirs = subDirs.filter(dir => {
      const name = dir.name.toLowerCase();
      return name.includes('doc') || 
             name.includes('spec') || 
             name.includes('rfc') || 
             name.includes('src') || 
             name.includes('lib');
    });
    
    if (importantDirs.length < subDirs.length) {
      logger.info(`目录深度接近限制，只处理 ${importantDirs.length}/${subDirs.length} 个重要子目录`);
    }
    
    // 只处理重要目录
    for (const subDir of importantDirs) {
      try {
        // 递归处理子目录
        await processDirectoryStream(
          owner,
          repo,
          branch,
          subDir.path,
          chunkHandler,
          sourceName,
          stats,
          depthLevel + 1
        );
      } catch (error) {
        logger.warn(`处理子目录 ${subDir.path} 时出错: ${error.message}`);
      }
      
      // 防止触发GitHub API限制，添加小延迟
      await delay(300);
    }
  } else {
    // 处理所有子目录
    for (const subDir of subDirs) {
      try {
        // 递归处理子目录
        await processDirectoryStream(
          owner,
          repo,
          branch,
          subDir.path,
          chunkHandler,
          sourceName,
          stats,
          depthLevel + 1
        );
      } catch (error) {
        logger.warn(`处理子目录 ${subDir.path} 时出错: ${error.message}`);
      }
      
      // 防止触发GitHub API限制，添加小延迟
      await delay(300);
    }
  }
}

/**
 * 流式处理代码目录
 */
async function processCodeDirectoryStream(
  owner: string, 
  repo: string, 
  branch: string, 
  dirPath: string, 
  chunkHandler: (chunks: DocumentChunk[]) => Promise<void>, 
  sourceName: string,
  stats: GitHubScrapingStats,
  depthLevel: number = 0
): Promise<void> {
  const memoryManager = MemoryManager.getInstance();
  
  if (depthLevel > maxDepth) {
    logger.info(`跳过深度超过${maxDepth}的目录: ${dirPath}`);
    return;
  }
  
  // 获取目录内容
  try {
    const contents = await getRepositoryContents(owner, repo, branch, dirPath);
    if (!contents || contents.length === 0) {
      throw createResourceNotFoundError(`目录 ${dirPath} 不存在或为空`);
    }
    
    // 更新统计信息
    stats.totalFiles += contents.filter(item => item.type === 'file').length;
    stats.totalDirectories += contents.filter(item => item.type === 'dir').length;
    
    // 筛选代码文件
    const codeFiles = contents.filter(item => 
      item.type === 'file' && 
      CODE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext)) &&
      !IGNORED_GITHUB_FILES.some(name => item.name.toLowerCase().includes(name))
    );
    
    // 处理文件计数器和批处理大小
    let processedFilesCount = 0;
    const BATCH_SIZE = 3; // 每处理3个文件触发一次GC
    const MAX_CODE_FILES = 30; // 最多处理30个代码文件，优先处理重要文件
    
    // 如果代码文件过多，优先处理重要文件
    let filesToProcess = codeFiles;
    if (codeFiles.length > MAX_CODE_FILES && GITHUB_LIMIT_FILES) {
      // 识别重要的代码文件：接口定义、配置文件等
      const importantFiles = codeFiles.filter(file => {
        const name = file.name.toLowerCase();
        return name.includes('interface') || 
               name.includes('type') || 
               name.includes('config') || 
               name.includes('schema') || 
               name.endsWith('.d.ts');
      });
      
      // 其他文件随机选择
      const otherFiles = codeFiles.filter(file => {
        const name = file.name.toLowerCase();
        return !name.includes('interface') && 
               !name.includes('type') && 
               !name.includes('config') && 
               !name.includes('schema') && 
               !name.endsWith('.d.ts');
      });
      
      // 取重要文件和随机选择的其他文件
      const remainingSlots = MAX_CODE_FILES - importantFiles.length;
      const selectedOtherFiles = otherFiles.length <= remainingSlots 
        ? otherFiles 
        : otherFiles.sort(() => 0.5 - Math.random()).slice(0, remainingSlots);
      
      filesToProcess = [...importantFiles, ...selectedOtherFiles];
      logger.info(`目录 ${dirPath} 有 ${codeFiles.length} 个代码文件，将只处理 ${filesToProcess.length} 个 (${importantFiles.length} 个重要文件 + ${selectedOtherFiles.length} 个其他文件)`);
    }
    
    // 处理代码文件
    for (const codeFile of filesToProcess) {
      try {
        // 限制代码文件大小，跳过过大的文件
        if (codeFile.size && codeFile.size > 500000) {
          logger.info(`跳过大文件 ${codeFile.path} (${Math.round(codeFile.size/1024)}KB)`);
          continue;
        }
        
        const content = await getFileContent(owner, repo, branch, codeFile.path);
        if (content) {
          // 处理代码文件并生成文档块
          const chunks = processGitHubCode(
            content,
            codeFile.name,
            codeFile.path,
            codeFile.html_url,
            sourceName
          );
          
          stats.processedCodeFiles++;
          stats.processedFiles++;
          processedFilesCount++;
          
          // 使用回调处理文档块
          await chunkHandler(chunks);
          
          // 定期输出处理进度
          if (processedFilesCount % BATCH_SIZE === 0 || processedFilesCount === filesToProcess.length) {
            logger.info(`目录 ${dirPath}: 已处理 ${processedFilesCount}/${filesToProcess.length} 个代码文件`);
            
            // 尝试释放内存
            if (global.gc) {
              try {
                global.gc();
                logger.info('垃圾回收完成');
              } catch (e) {
                logger.warn('垃圾回收失败:', e);
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`处理代码文件 ${codeFile.path} 时出错: ${error.message}`);
      }
      
      // 防止触发GitHub API限制
      await delay(500);
    }
    
    // 递归处理子目录，但跳过忽略的目录
    const subDirs = contents.filter(item => 
      item.type === 'dir' && 
      !IGNORED_GITHUB_DIRS.includes(item.name.toLowerCase())
    );
    
    // 如果已经达到最大深度-1，只处理重要目录
    if (depthLevel >= GITHUB_MAX_DEPTH - 1) {
      const importantDirs = subDirs.filter(dir => {
        const name = dir.name.toLowerCase();
        return name.includes('core') || 
               name.includes('main') || 
               name.includes('lib') || 
               name.includes('api') || 
               name.includes('types');
      });
      
      if (importantDirs.length < subDirs.length) {
        logger.info(`代码目录深度接近限制，只处理 ${importantDirs.length}/${subDirs.length} 个重要子目录`);
      }
      
      // 只处理重要目录
      for (const subDir of importantDirs) {
        try {
          await processCodeDirectoryStream(
            owner,
            repo,
            branch,
            subDir.path,
            chunkHandler,
            sourceName,
            stats,
            depthLevel + 1
          );
        } catch (error) {
          logger.warn(`处理子目录 ${subDir.path} 时出错: ${error.message}`);
        }
        
        // 防止触发GitHub API限制
        await delay(300);
      }
    } else {
      // 处理所有子目录
      for (const subDir of subDirs) {
        try {
          // 递归处理子目录
          await processCodeDirectoryStream(
            owner,
            repo,
            branch,
            subDir.path,
            chunkHandler,
            sourceName,
            stats,
            depthLevel + 1
          );
        } catch (error) {
          logger.warn(`处理子目录 ${subDir.path} 时出错: ${error.message}`);
        }
        
        // 防止触发GitHub API限制
        await delay(300);
      }
    }
  } catch (error) {
    if (error instanceof DocumentProcessingError) {
      throw error;
    } else {
      throw createGitHubApiError(`获取目录 ${dirPath} 内容时出错: ${error.message}`);
    }
  }
}

/**
 * 处理GitHub Markdown内容
 */
function processGitHubMarkdown(
  content: string,
  fileName: string,
  htmlUrl: string,
  sourceName: string,
  category: string = 'documentation'
): DocumentChunk[] {
  if (!content || content.trim().length < MIN_CHUNK_LENGTH) {
    return [];
  }
  
  const chunks: DocumentChunk[] = [];
  const title = fileName.replace(/\.md$/i, '');
  
  // 分割Markdown内容为多个部分
  const sections = content.split(/^#{1,2}\s+/m);
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (section.length < MIN_CHUNK_LENGTH) continue;
    
    // 尝试提取标题
    let sectionTitle = i === 0 ? title : '';
    let sectionContent = section;
    
    const firstLineBreak = section.indexOf('\n');
    if (firstLineBreak > 0) {
      sectionTitle = section.substring(0, firstLineBreak).trim();
      sectionContent = section.substring(firstLineBreak + 1).trim();
    }
    
    // 将长文档拆分为更小的块
    const subSections = splitIntoChunks(sectionContent);
    
    for (let j = 0; j < subSections.length; j++) {
      const chunk = subSections[j];
      if (chunk.length < MIN_CHUNK_LENGTH) continue;
      
      const id = createDocumentId(`${sourceName}-${title}-${i}-${j}`, Date.now());
      
      chunks.push({
        id,
        content: chunk,
        title: sectionTitle || title,
        url: htmlUrl,
        source: sourceName,
        category,
        createdAt: Date.now(),
        metadata: {
          scraper: 'github',
          fileType: 'markdown',
          fileName
        }
      });
    }
  }
  
  return chunks;
}

/**
 * 处理GitHub代码文件内容
 */
function processGitHubCode(
  content: string,
  fileName: string,
  filePath: string,
  htmlUrl: string,
  sourceName: string
): DocumentChunk[] {
  if (!content || content.trim().length < MIN_CHUNK_LENGTH) {
    return [];
  }
  
  const chunks: DocumentChunk[] = [];
  const fileExtension = path.extname(fileName).toLowerCase();
  
  // 提取代码注释块
  let commentBlocks: string[] = [];
  
  // 根据文件类型选择注释格式
  if (['.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.cs', '.go', '.swift', '.kt'].includes(fileExtension)) {
    // 提取块注释 /* ... */
    const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
    const blockComments = content.match(blockCommentRegex) || [];
    commentBlocks.push(...blockComments);
    
    // 提取行注释 // ...
    const lines = content.split('\n');
    let currentComment = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        if (currentComment) currentComment += '\n';
        currentComment += trimmed.substring(2).trim();
      } else if (currentComment) {
        if (currentComment.length >= MIN_CHUNK_LENGTH) {
          commentBlocks.push(currentComment);
        }
        currentComment = '';
      }
    }
    
    if (currentComment && currentComment.length >= MIN_CHUNK_LENGTH) {
      commentBlocks.push(currentComment);
    }
  } else if (['.py', '.rb'].includes(fileExtension)) {
    // Python/Ruby处理
    // 提取文档字符串 """ ... """ 或 ''' ... '''
    const docStringRegex = /"{3}[\s\S]*?"{3}|'{3}[\s\S]*?'{3}/g;
    const docStrings = content.match(docStringRegex) || [];
    commentBlocks.push(...docStrings);
    
    // 提取行注释 # ...
    const lines = content.split('\n');
    let currentComment = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        if (currentComment) currentComment += '\n';
        currentComment += trimmed.substring(1).trim();
      } else if (currentComment) {
        if (currentComment.length >= MIN_CHUNK_LENGTH) {
          commentBlocks.push(currentComment);
        }
        currentComment = '';
      }
    }
    
    if (currentComment && currentComment.length >= MIN_CHUNK_LENGTH) {
      commentBlocks.push(currentComment);
    }
  }
  
  // 处理提取的注释
  for (let i = 0; i < commentBlocks.length; i++) {
    const block = commentBlocks[i].trim();
    if (block.length < MIN_CHUNK_LENGTH) continue;
    
    // 清理注释标记
    let cleanedBlock = block
      .replace(/\/\*+|\*+\/|#{1,}\s*|\/\/{1,}\s*|"{3}|'{3}/g, ' ')
      .replace(/\*\s+/gm, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanedBlock.length < MIN_CHUNK_LENGTH) continue;
    
    const id = createDocumentId(`${sourceName}-${fileName}-comment-${i}`, Date.now());
    
    chunks.push({
      id,
      content: cleanedBlock,
      title: `${fileName} - 代码注释`,
      url: htmlUrl,
      source: sourceName,
      category: 'code',
      createdAt: Date.now(),
      metadata: {
        scraper: 'github',
        fileType: 'code',
        fileName,
        filePath,
        language: fileExtension.substring(1)
      }
    });
  }
  
  // 为重要的代码文件添加整体内容（如配置文件、类型定义等）
  const isImportantFile = 
    fileName.includes('config') || 
    fileName.includes('type') || 
    fileName.includes('schema') || 
    fileName.includes('interface') ||
    fileName.endsWith('.d.ts');
  
  if (isImportantFile) {
    const id = createDocumentId(`${sourceName}-${fileName}-full`, Date.now());
    
    chunks.push({
      id,
      content: content.substring(0, 10000), // 限制大小
      title: `${fileName} - 完整代码`,
      url: htmlUrl,
      source: sourceName,
      category: 'code',
      createdAt: Date.now(),
      metadata: {
        scraper: 'github',
        fileType: 'code',
        fileName,
        filePath,
        language: fileExtension.substring(1),
        isFullFile: true
      }
    });
  }
  
  return chunks;
}