/**
 * CKB生态文档处理模块 - GitHub仓库抓取器
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types';
import { createLogger } from '../utils/logger';
import { createDocumentId, parseGitHubUrl, splitIntoChunks } from '../utils/helpers';
import { 
  createGitHubApiError, 
  createResourceNotFoundError, 
  DocumentProcessingError, 
  safeExecute 
} from '../utils/errors';
import { 
  getGitHubHeaders, 
  GITHUB_MAX_RETRIES, 
  GITHUB_RETRY_DELAY, 
  MIN_CHUNK_LENGTH,
  CODE_EXTENSIONS,
  IGNORED_GITHUB_DIRS,
  IGNORED_GITHUB_FILES
} from '../core/config';
import { fetchWithRetry } from '../utils/network';
import { delay } from '../utils/helpers';

// 初始化日志记录器
const logger = createLogger('GitHubScraper');

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
 * 从GitHub仓库抓取内容
 */
export async function scrapeGitHubRepo(source: DocumentSource): Promise<ScrapingResult> {
  logger.info(`抓取GitHub仓库: ${source.url}`);
  const startTime = Date.now();
  
  return await safeExecute(async () => {
    // 解析GitHub URL
    const repoInfo = parseGitHubUrl(source.url);
    if (!repoInfo) {
      throw createResourceNotFoundError(`无效的GitHub仓库URL: ${source.url}`);
    }
    
    const { owner, repo } = repoInfo;
    logger.info(`解析仓库信息: ${owner}/${repo}`);
    
    // 获取仓库默认分支
    const defaultBranch = await getDefaultBranch(owner, repo);
    logger.info(`仓库 ${owner}/${repo} 的默认分支为: ${defaultBranch}`);
    
    // 获取并处理仓库内容
    const chunks: DocumentChunk[] = [];
    
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
        
        chunks.push(...readmeChunks);
      }
    } catch (error) {
      logger.warn(`获取README失败: ${error.message}`);
    }
    
    // 然后，获取其他重要文档目录
    const docsDirectories = ['docs', 'doc', 'documentation', 'wiki', 'specs', 'rfcs'];
    
    for (const docsDir of docsDirectories) {
      try {
        await processDirectory(owner, repo, defaultBranch, docsDir, chunks, source.name);
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
      const markdownFiles = rootFiles.filter(file => 
        file.type === 'file' && 
        file.name.toLowerCase().endsWith('.md') &&
        file.name.toLowerCase() !== 'readme.md'
      );
      
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
            
            chunks.push(...mdChunks);
          }
        } catch (error) {
          logger.warn(`获取文件 ${mdFile.path} 失败: ${error.message}`);
        }
      }
    } catch (error) {
      logger.warn(`获取根目录文件列表失败: ${error.message}`);
    }
    
    // 如果是关键的CKB技术仓库，还需要处理源代码和注释
    const isCkbRepo = source.url.includes('nervosnetwork') || 
                      source.url.includes('ckb-') || 
                      source.url.includes('sporeprotocol');
    
    if (isCkbRepo) {
      logger.info(`检测到关键CKB技术仓库，将分析源代码和注释`);
      try {
        // 获取源代码目录
        const srcDirs = ['src', 'lib', 'packages', 'core', 'modules'];
        for (const srcDir of srcDirs) {
          try {
            await processCodeDirectory(owner, repo, defaultBranch, srcDir, chunks, source.name);
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
    }
    
    const endTime = Date.now();
    logger.info(`从 ${source.url} 提取了 ${chunks.length} 个文档片段，耗时 ${endTime - startTime}ms`);
    
    return {
      success: true,
      chunks,
      message: `成功抓取GitHub仓库 ${source.url}`,
      stats: {
        totalChunks: chunks.length,
        timeMs: endTime - startTime
      }
    };
  }, (error: DocumentProcessingError) => {
    return {
      success: false,
      chunks: [],
      error,
      message: `抓取 ${source.url} 失败: ${error.message}`,
      stats: {
        totalChunks: 0,
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
 * 处理目录内容
 */
async function processDirectory(
  owner: string, 
  repo: string, 
  branch: string, 
  dirPath: string, 
  chunks: DocumentChunk[], 
  sourceName: string
): Promise<void> {
  try {
    const contents = await getRepositoryContents(owner, repo, branch, dirPath);
    
    // 首先处理所有Markdown文件
    const markdownFiles = contents.filter(item => 
      item.type === 'file' && item.name.toLowerCase().endsWith('.md')
    );
    
    for (const mdFile of markdownFiles) {
      try {
        const content = await getFileContent(owner, repo, branch, mdFile.path);
        if (content) {
          logger.info(`处理Markdown文件: ${mdFile.path}`);
          
          const mdChunks = processGitHubMarkdown(
            content,
            mdFile.name,
            mdFile.html_url,
            sourceName,
            'documentation'
          );
          
          chunks.push(...mdChunks);
        }
      } catch (error) {
        logger.warn(`处理文件 ${mdFile.path} 失败: ${error.message}`);
      }
      
      // 添加延迟以避免触发API速率限制
      await delay(100);
    }
    
    // 然后递归处理子目录
    const directories = contents.filter(item => 
      item.type === 'dir' && !IGNORED_GITHUB_DIRS.includes(item.name)
    );
    
    for (const dir of directories) {
      try {
        await processDirectory(owner, repo, branch, dir.path, chunks, sourceName);
      } catch (error) {
        logger.warn(`处理目录 ${dir.path} 失败: ${error.message}`);
      }
      
      // 添加延迟以避免触发API速率限制
      await delay(200);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * 处理代码目录
 */
async function processCodeDirectory(
  owner: string, 
  repo: string, 
  branch: string, 
  dirPath: string, 
  chunks: DocumentChunk[], 
  sourceName: string
): Promise<void> {
  try {
    const contents = await getRepositoryContents(owner, repo, branch, dirPath);
    
    // 处理代码文件
    const codeFiles = contents.filter(item => 
      item.type === 'file' && 
      !IGNORED_GITHUB_FILES.includes(item.name) &&
      CODE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
    );
    
    for (const codeFile of codeFiles) {
      try {
        const content = await getFileContent(owner, repo, branch, codeFile.path);
        if (content) {
          logger.info(`处理代码文件: ${codeFile.path}`);
          
          const codeChunks = processGitHubCode(
            content,
            codeFile.name,
            codeFile.path,
            codeFile.html_url,
            sourceName
          );
          
          chunks.push(...codeChunks);
        }
      } catch (error) {
        logger.warn(`处理文件 ${codeFile.path} 失败: ${error.message}`);
      }
      
      // 添加延迟以避免触发API速率限制
      await delay(100);
    }
    
    // 递归处理子目录
    const directories = contents.filter(item => 
      item.type === 'dir' && !IGNORED_GITHUB_DIRS.includes(item.name)
    );
    
    for (const dir of directories) {
      try {
        await processCodeDirectory(owner, repo, branch, dir.path, chunks, sourceName);
      } catch (error) {
        logger.warn(`处理目录 ${dir.path} 失败: ${error.message}`);
      }
      
      // 添加延迟以避免触发API速率限制
      await delay(200);
    }
  } catch (error) {
    throw error;
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