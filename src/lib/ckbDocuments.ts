/**
 * CKB生态文档处理模块
 * 
 * 负责抓取、解析和准备CKB生态技术文档用于RAG系统
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
// 导入PDF解析库
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import * as dotenv from 'dotenv';

dotenv.config();

// CKB文档源定义
interface DocumentSource {
  name: string;
  url: string;
  type: 'website' | 'github' | 'file';
  selector?: string; // CSS选择器，用于网站抓取
  enabled?: boolean; // 是否启用该源
  filePath?: string; // 本地文件路径，用于file类型
  fileType?: 'text' | 'markdown' | 'pdf'; // 文件类型，用于file类型
}

// 文档片段接口
export interface DocumentChunk {
  id: string;
  content: string;
  title: string;
  url: string;
  source: string;
  category: string;
}

// CKB主要文档源
const CKB_DOCUMENT_SOURCES: DocumentSource[] = [
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
    name: 'CKB 开发者文档',
    url: 'https://docs.nervos.org/docs/getting-started/how-ckb-works',
    type: 'website',
    selector: '.markdown',
    enabled: true
  },
  {
    name: "CKB CCC SDK",
    url: "https://github.com/ckb-devrel/ccc",
    type: 'github',
    enabled: true
  }
];

// 本地缓存配置
const CACHE_DIR = path.join(process.cwd(), 'cache');
const DOCUMENTS_CACHE_FILE = path.join(CACHE_DIR, 'ckb-documents.json');

// GitHub API配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // 从环境变量获取GitHub令牌
const USE_GITHUB_AUTH = GITHUB_TOKEN.length > 0;
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY = 1000; // 重试延迟（毫秒）

/**
 * 创建GitHub API请求头
 */
function getGitHubHeaders() {
  const headers: Record<string, string> = {
    'User-Agent': 'CKB-Doc-Bot/1.0',
    'Accept': 'application/vnd.github.v3+json'
  };
  
  if (USE_GITHUB_AUTH) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }
  
  return headers;
}

/**
 * 带重试的API请求
 */
async function fetchWithRetry(url: string, options: any, retries = MAX_RETRIES): Promise<any> {
  try {
    const response = await axios(url, options);
    return response;
  } catch (error) {
    if (error.response && error.response.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
      console.log(`GitHub API速率限制已达到。将在${RETRY_DELAY}毫秒后重试...`);
      // 如果是速率限制问题并且还有重试次数，则等待后重试
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, options, retries - 1);
      }
    }
    throw error;
  }
}

/**
 * 抓取网站内容
 */
async function scrapeWebsite(source: DocumentSource): Promise<DocumentChunk[]> {
  console.log(`抓取网站: ${source.url}`);
  const chunks: DocumentChunk[] = [];
  
  try {
    const response = await axios.get(source.url, {
      timeout: 20000, // 增加超时时间到20秒
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      // 允许重定向
      maxRedirects: 5
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    const $ = cheerio.load(response.data);
    
    // 使用指定的选择器，或默认选择主要内容
    const contentSelector = source.selector || 'body';
    
    // 尝试多种选择器，如果主选择器无效
    let content = '';
    if ($(contentSelector).length > 0) {
      content = $(contentSelector).text();
    } else if (source.url.includes('nervos.org')) {
      // 针对Nervos网站的备选选择器
      const alternativeSelectors = [
        'article', '.markdown', '.content', 
        'main', '.main-content', '.document-content',
        '.docs-content', '.page-content'
      ];
      
      for (const selector of alternativeSelectors) {
        if ($(selector).length > 0) {
          console.log(`使用备选选择器 "${selector}" 提取内容`);
          content = $(selector).text();
          break;
        }
      }
      
      // 如果仍然没有内容，尝试获取所有文本
      if (!content) {
        content = $('body').text();
      }
    }
    
    if (!content || content.trim().length === 0) {
      throw new Error('无法提取有效内容');
    }
    
    // 简单分段处理
    const paragraphs = content
      .split('\n')
      .filter(p => p.trim().length > 0)
      .map(p => p.trim());
    
    // 为每个段落创建文档片段
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].length < 10) continue; // 跳过过短的段落
      
      chunks.push({
        id: `${source.name.toLowerCase().replace(/\s+/g, '-')}-${i}`,
        content: paragraphs[i],
        title: source.name,
        url: source.url,
        source: source.name,
        category: 'documentation'
      });
    }
    
    console.log(`从 ${source.url} 提取了 ${chunks.length} 个文档片段`);
  } catch (error) {
    console.error(`抓取 ${source.url} 失败:`, error.message || error);
  }
  
  return chunks;
}

/**
 * 从GitHub仓库抓取内容
 */
async function scrapeGitHubRepo(source: DocumentSource): Promise<DocumentChunk[]> {
  console.log(`抓取GitHub仓库: ${source.url}`);
  const chunks: DocumentChunk[] = [];
  
  try {
    // 分析仓库URL，提取所有者和仓库名
    const match = source.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error(`无效的GitHub仓库URL: ${source.url}`);
    }
    
    const [_, owner, repo] = match;
    
    // 尝试获取仓库信息，确定默认分支
    const possibleBranches = ['master', 'main', 'develop', 'dev'];
    let defaultBranch = 'master'; // 默认假设为master
    
    try {
      // 尝试通过GitHub API获取仓库信息
      const repoInfoResponse = await fetchWithRetry(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: getGitHubHeaders(),
        timeout: 10000
      });
      
      if (repoInfoResponse.status === 200 && repoInfoResponse.data.default_branch) {
        defaultBranch = repoInfoResponse.data.default_branch;
        console.log(`仓库 ${owner}/${repo} 的默认分支为: ${defaultBranch}`);
      }
    } catch (apiError) {
      console.log(`无法通过API获取仓库 ${owner}/${repo} 的默认分支信息，将尝试常见分支名`);
    }
    
    // 尝试抓取README和其他常见文档
    let successfulBranch = null;
    
    for (const branch of [defaultBranch, ...possibleBranches.filter(b => b !== defaultBranch)]) {
      try {
        const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
        const response = await fetchWithRetry(readmeUrl, {
          timeout: 10000,
          headers: getGitHubHeaders()
        });
        
        if (response.status === 200) {
          successfulBranch = branch;
          console.log(`成功找到 ${owner}/${repo} 仓库的 ${branch} 分支`);
          
          // 处理README内容
          const readmeContent = response.data;
          const readmeSections = readmeContent.split('\n## ');
          
          for (let i = 0; i < readmeSections.length; i++) {
            processGitHubContent(readmeSections[i], i === 0 ? source.name : '', readmeUrl, source.name, chunks);
          }
          
          break; // 找到可用分支后跳出循环
        }
      } catch (readmeError) {
        console.log(`尝试分支 ${branch} 的README失败`);
      }
    }
    
    if (!successfulBranch) {
      throw new Error(`无法在任何常见分支找到该仓库的README文件`);
    }
    
    // 尝试抓取特定RFC目录（如果存在）
    if (repo === 'rfcs' || source.url.includes('/rfcs')) {
      try {
        // 尝试获取RFC目录结构
        const rfcIndexUrl = `https://api.github.com/repos/${owner}/${repo}/contents/rfcs?ref=${successfulBranch}`;
        const rfcResponse = await fetchWithRetry(rfcIndexUrl, {
          headers: getGitHubHeaders(),
          timeout: 10000
        });
        
        if (rfcResponse.status === 200 && Array.isArray(rfcResponse.data)) {
          // 处理目录，但为了避免API限制，添加延迟和批处理
          const rfcDirs = rfcResponse.data.filter(item => item.type === 'dir');
          const batchSize = 5; // 每批处理的目录数量
          
          for (let i = 0; i < rfcDirs.length; i += batchSize) {
            const batchDirs = rfcDirs.slice(i, i + batchSize);
            
            // 并行处理每一批
            await Promise.all(batchDirs.map(async (rfcDir) => {
              try {
                const rfcContentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/rfcs/${rfcDir.name}?ref=${successfulBranch}`;
                const contentResponse = await fetchWithRetry(rfcContentUrl, {
                  headers: getGitHubHeaders(),
                  timeout: 10000
                });
                
                if (contentResponse.status === 200 && Array.isArray(contentResponse.data)) {
                  const mdFiles = contentResponse.data.filter(file => 
                    file.type === 'file' && file.name.endsWith('.md')
                  );
                  
                  // 为了避免API限制，添加延迟和批处理
                  const fileBatchSize = 2; // 每批处理的文件数量
                  
                  for (let j = 0; j < mdFiles.length; j += fileBatchSize) {
                    const batchFiles = mdFiles.slice(j, j + fileBatchSize);
                    
                    // 并行处理每一批文件
                    await Promise.all(batchFiles.map(async (mdFile) => {
                      try {
                        const mdResponse = await fetchWithRetry(mdFile.download_url, {
                          timeout: 10000,
                          headers: getGitHubHeaders()
                        });
                        
                        if (mdResponse.status === 200) {
                          console.log(`找到RFC文档: ${mdFile.path}`);
                          processGitHubContent(
                            mdResponse.data, 
                            `RFC: ${mdFile.name.replace('.md', '')}`,
                            mdFile.html_url,
                            source.name,
                            chunks
                          );
                        }
                      } catch (mdError) {
                        console.log(`获取RFC文档 ${mdFile.path} 失败: ${mdError.message || mdError}`);
                      }
                    }));
                    
                    // 在批处理之间添加延迟，避免触发速率限制
                    if (j + fileBatchSize < mdFiles.length) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                    }
                  }
                }
              } catch (dirError) {
                console.log(`获取RFC目录 ${rfcDir.name} 内容失败: ${dirError.message || dirError}`);
              }
            }));
            
            // 在批处理之间添加延迟，避免触发速率限制
            if (i + batchSize < rfcDirs.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (rfcError) {
        console.log(`获取RFC目录结构失败: ${rfcError.message}`);
      }
    }
    
    // 尝试抓取docs目录
    const docsDirectories = ['docs', 'doc', 'documentation', 'document', 'documents', 'wiki'];
    
    for (const docsDir of docsDirectories) {
      try {
        // 尝试获取目录列表，GitHub不直接支持这个，所以我们尝试一些常见文件
        const docsIndexFiles = ['index.md', 'README.md', 'overview.md'];
        
        for (const indexFile of docsIndexFiles) {
          const indexUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${successfulBranch}/${docsDir}/${indexFile}`;
          
          try {
            const response = await fetchWithRetry(indexUrl, {
              timeout: 10000,
              headers: getGitHubHeaders()
            });
            
            if (response.status === 200) {
              console.log(`找到文档目录: ${docsDir}/${indexFile}`);
              processGitHubContent(response.data, `${source.name} 文档`, indexUrl, source.name, chunks);
              break;
            }
          } catch (indexError) {
            // 忽略单个索引文件的错误，继续尝试下一个
          }
        }
      } catch (docsError) {
        // 忽略文档目录错误，继续尝试下一个目录
      }
    }
    
    console.log(`从 ${source.url} 提取了 ${chunks.length} 个文档片段`);
  } catch (error) {
    console.error(`抓取 ${source.url} 失败:`, error.message || error);
  }
  
  return chunks;
}

/**
 * 处理从GitHub获取的内容
 */
function processGitHubContent(content: string, title: string, url: string, sourceName: string, chunks: DocumentChunk[]): void {
  if (!content || content.trim().length < 20) {
    return;
  }
  
  // 分段处理Markdown内容
  const sections = content.split('\n## ');
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (section.length < 20) continue;
    
    // 尝试提取标题
    let sectionTitle = i === 0 ? title : '';
    let sectionContent = section;
    
    const firstLineBreak = section.indexOf('\n');
    if (firstLineBreak > 0) {
      sectionTitle = section.substring(0, firstLineBreak).trim();
      sectionContent = section.substring(firstLineBreak + 1).trim();
      if (i > 0) {
        sectionTitle = '## ' + sectionTitle; // 还原标题格式
      }
    }
    
    // 将长文档拆分为更小的块，大约每500-1000个字符
    const subSections = splitIntoChunks(sectionContent, 1000);
    
    for (let j = 0; j < subSections.length; j++) {
      const chunk = subSections[j];
      if (chunk.length < 20) continue;
      
      chunks.push({
        id: `${sourceName.toLowerCase().replace(/\s+/g, '-')}-${i}-${j}-${Date.now()}`,
        content: chunk,
        title: sectionTitle || title,
        url: url,
        source: sourceName,
        category: 'github'
      });
    }
  }
}

/**
 * 将长文本拆分为更小的块
 */
function splitIntoChunks(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    
    if (currentChunk.length > 0) {
      currentChunk += '\n\n';
    }
    
    currentChunk += paragraph;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * 确保缓存目录存在
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * 加载缓存的文档
 */
export function loadCachedDocuments(): DocumentChunk[] | null {
  try {
    if (fs.existsSync(DOCUMENTS_CACHE_FILE)) {
      const data = fs.readFileSync(DOCUMENTS_CACHE_FILE, 'utf-8');
      const docs = JSON.parse(data);
      if (Array.isArray(docs) && docs.length > 0) {
        return docs;
      }
    }
  } catch (error) {
    console.error('加载缓存文档失败:', error);
  }
  return null;
}

/**
 * 缓存文档
 */
function cacheDocuments(documents: DocumentChunk[]) {
  try {
    ensureCacheDir();
    fs.writeFileSync(DOCUMENTS_CACHE_FILE, JSON.stringify(documents, null, 2));
    console.log(`已缓存 ${documents.length} 个文档片段`);
  } catch (error) {
    console.error('缓存文档失败:', error);
  }
}

/**
 * 处理本地文件
 */
async function processLocalFile(source: DocumentSource): Promise<DocumentChunk[]> {
  console.log(`处理本地文件: ${source.filePath}`);
  const chunks: DocumentChunk[] = [];
  
  try {
    if (!source.filePath || !fs.existsSync(source.filePath)) {
      throw new Error(`文件不存在: ${source.filePath}`);
    }
    
    // 获取文件名作为标题
    const fileName = path.basename(source.filePath);
    const title = source.name || fileName;
    
    let processedContent = '';
    
    // 根据文件类型进行不同的处理
    if (source.fileType === 'pdf') {
      // 处理PDF文件
      try {
        const dataBuffer = fs.readFileSync(source.filePath);
        const pdfData = await pdfParse(dataBuffer);
        processedContent = pdfData.text;
      } catch (pdfError) {
        console.error(`解析PDF文件失败: ${source.filePath}`, pdfError);
        throw new Error(`PDF解析失败: ${pdfError.message}`);
      }
    } else {
      // 处理文本文件
      const content = fs.readFileSync(source.filePath, 'utf-8');
      processedContent = content;
      
      if (source.fileType === 'markdown') {
        // 如果是Markdown文件，可以进行特殊处理，例如去除Markdown标记
        processedContent = content
          .replace(/#{1,6}\s+/g, '') // 移除标题标记
          .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
          .replace(/\*(.*?)\*/g, '$1') // 移除斜体
          .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)'); // 将链接转为文本
      }
    }
    
    // 分段处理内容
    const subSections = splitIntoChunks(processedContent, 1000);
    
    for (let i = 0; i < subSections.length; i++) {
      const chunk = subSections[i];
      if (chunk.length < 20) continue;
      
      chunks.push({
        id: `${source.name.toLowerCase().replace(/\s+/g, '-')}-local-${i}`,
        content: chunk,
        title: title,
        url: `file://${source.filePath}`,
        source: source.name,
        category: 'local-file'
      });
    }
    
    console.log(`从 ${source.filePath} 提取了 ${chunks.length} 个文档片段`);
  } catch (error) {
    console.error(`处理本地文件 ${source.filePath} 失败:`, error);
  }
  
  return chunks;
}

/**
 * 抓取所有文档源
 */
export async function fetchAllDocuments(forceRefresh = false): Promise<DocumentChunk[]> {
  // 如果不强制刷新，尝试从缓存加载
  if (!forceRefresh) {
    const cached = loadCachedDocuments();
    if (cached && cached.length > 0) {
      console.log(`从缓存加载了 ${cached.length} 个文档片段`);
      return cached;
    }
  }
  
  console.log('开始抓取CKB文档...');
  
  // 添加本地 data/ckb-docs 目录下的所有文件作为文档源
  const localDocsDir = path.join(process.cwd(), 'data', 'ckb-docs');
  if (fs.existsSync(localDocsDir)) {
    console.log(`发现本地文档目录: ${localDocsDir}`);
    const addedCount = addLocalDirectorySource(localDocsDir, 'CKB本地文档');
    if (addedCount > 0) {
      console.log(`自动添加了 ${addedCount} 个本地文档文件`);
    }
  } else {
    console.log(`本地文档目录不存在: ${localDocsDir}，将跳过添加本地文档`);
    // 创建目录，方便用户以后放置文档
    try {
      fs.mkdirSync(path.join(process.cwd(), 'data', 'ckb-docs'), { recursive: true });
      console.log(`已创建本地文档目录: ${localDocsDir}，您可以将文档放置于此目录`);
    } catch (error) {
      console.error('创建本地文档目录失败:', error);
    }
  }
  
  let allChunks: DocumentChunk[] = [];
  
  // 只处理启用的文档源
  const enabledSources = CKB_DOCUMENT_SOURCES.filter(source => source.enabled !== false);
  
  const scrapePromises = enabledSources.map(async (source) => {
    try {
      let chunks: DocumentChunk[] = [];
      
      if (source.type === 'website') {
        chunks = await scrapeWebsite(source);
      } else if (source.type === 'github') {
        chunks = await scrapeGitHubRepo(source);
      } else if (source.type === 'file') {
        chunks = await processLocalFile(source);
      }
      
      return chunks;
    } catch (error) {
      console.error(`处理文档源 ${source.name} 时出错:`, error);
      return [];
    }
  });
  
  // 并行抓取所有文档源
  const resultsArrays = await Promise.all(scrapePromises);
  
  // 合并所有结果
  for (const chunks of resultsArrays) {
    allChunks = [...allChunks, ...chunks];
  }
  
  // 对文档进行去重
  const uniqueChunks = removeDuplicateChunks(allChunks);
  
  // 缓存文档
  if (uniqueChunks.length > 0) {
    cacheDocuments(uniqueChunks);
  }
  
  console.log(`总共获取了 ${uniqueChunks.length} 个文档片段`);
  return uniqueChunks;
}

/**
 * 去除重复的文档片段（基于内容相似度）
 */
function removeDuplicateChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const uniqueChunks: DocumentChunk[] = [];
  const seenContents = new Set<string>();
  
  for (const chunk of chunks) {
    // 创建一个简化版本的内容用于比较
    // 移除空格和标点符号，转换为小写
    const simplifiedContent = chunk.content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!seenContents.has(simplifiedContent) && simplifiedContent.length > 20) {
      seenContents.add(simplifiedContent);
      uniqueChunks.push(chunk);
    }
  }
  
  return uniqueChunks;
}

/**
 * 添加自定义文档
 * @param content 文档内容
 * @param title 文档标题
 * @param source 文档来源
 */
export function addCustomDocument(content: string, title: string, source: string): DocumentChunk[] {
  // 加载现有文档
  let documents = loadCachedDocuments() || [];
  
  // 将内容分段
  const paragraphs = splitIntoChunks(content, 1000);
  
  // 为每个段落创建文档片段
  const newChunks: DocumentChunk[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].length < 20) continue;
    
    const chunk: DocumentChunk = {
      id: `custom-${Date.now()}-${i}`,
      content: paragraphs[i],
      title,
      url: 'custom',
      source,
      category: 'custom'
    };
    
    newChunks.push(chunk);
  }
  
  // 合并并缓存
  documents = [...documents, ...newChunks];
  cacheDocuments(documents);
  
  return newChunks;
}

/**
 * 添加本地文件作为文档源
 * @param name 文档源名称
 * @param filePath 文件路径
 * @param fileType 文件类型
 * @returns 是否添加成功
 */
export function addLocalFileSource(name: string, filePath: string, fileType?: 'text' | 'markdown' | 'pdf'): boolean {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.error(`文件不存在: ${filePath}`);
      return false;
    }
    
    // 如果未指定文件类型，则根据扩展名自动检测
    if (!fileType) {
      const ext = path.extname(filePath).toLowerCase();
      if (['.md', '.markdown'].includes(ext)) {
        fileType = 'markdown';
      } else if (ext === '.pdf') {
        fileType = 'pdf';
      } else {
        fileType = 'text';
      }
    }
    
    // 检查是否已存在相同路径的文档源
    const existingIndex = CKB_DOCUMENT_SOURCES.findIndex(
      source => source.type === 'file' && source.filePath === filePath
    );
    
    if (existingIndex >= 0) {
      console.log(`文档源已存在，更新现有文档源: ${name}`);
      CKB_DOCUMENT_SOURCES[existingIndex] = {
        ...CKB_DOCUMENT_SOURCES[existingIndex],
        name,
        fileType,
        enabled: true
      };
    } else {
      // 添加新的文档源
      CKB_DOCUMENT_SOURCES.push({
        name,
        url: `file://${filePath}`,
        type: 'file',
        filePath,
        fileType,
        enabled: true
      });
      console.log(`添加新文档源: ${name}`);
    }
    
    return true;
  } catch (error) {
    console.error('添加本地文件文档源失败:', error);
    return false;
  }
}

/**
 * 将本地目录下的所有文件添加为文档源
 * @param dirPath 目录路径
 * @param namePrefix 文档源名称前缀
 * @param recursive 是否递归处理子目录
 * @returns 添加的文件数量
 */
export function addLocalDirectorySource(dirPath: string, namePrefix: string = 'CKB本地文档', recursive: boolean = true): number {
  try {
    if (!fs.existsSync(dirPath)) {
      console.error(`目录不存在: ${dirPath}`);
      return 0;
    }
    
    let addedCount = 0;
    const processDirectory = (currentPath: string, currentPrefix: string) => {
      const files = fs.readdirSync(currentPath);
      
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory() && recursive) {
          // 递归处理子目录
          processDirectory(fullPath, `${currentPrefix} - ${file}`);
        } else if (stats.isFile()) {
          // 判断文件类型
          const ext = path.extname(file).toLowerCase();
          let fileType: 'text' | 'markdown' | 'pdf' = 'text';
          
          if (['.md', '.markdown'].includes(ext)) {
            fileType = 'markdown';
          } else if (ext === '.pdf') {
            fileType = 'pdf';
          } else if (['.txt', '.js', '.ts', '.html', '.css', '.json'].includes(ext)) {
            fileType = 'text';
          } else {
            // 跳过不支持的文件类型
            continue;
          }
          
          const fileName = path.basename(file, ext);
          const sourceName = `${currentPrefix} - ${fileName}`;
          
          if (addLocalFileSource(sourceName, fullPath, fileType)) {
            addedCount++;
          }
        }
      }
    };
    
    processDirectory(dirPath, namePrefix);
    console.log(`成功添加 ${addedCount} 个本地文件作为文档源`);
    return addedCount;
  } catch (error) {
    console.error('添加本地目录文档源失败:', error);
    return 0;
  }
}

/**
 * 清理文档缓存并强制重新获取所有文档
 */
export async function cleanAndRefetchDocuments(): Promise<DocumentChunk[]> {
  try {
    // 清理缓存文件
    if (fs.existsSync(DOCUMENTS_CACHE_FILE)) {
      fs.unlinkSync(DOCUMENTS_CACHE_FILE);
      console.log('已清理文档缓存文件');
    }
    
    // 重置文档源列表中的本地文件源（仅保留内置源）
    const builtinSources = CKB_DOCUMENT_SOURCES.filter(source => source.type !== 'file');
    CKB_DOCUMENT_SOURCES.length = 0;
    builtinSources.forEach(source => CKB_DOCUMENT_SOURCES.push(source));
    
    console.log('已重置文档源列表，正在重新获取所有文档...');
    
    // 强制重新获取所有文档
    return await fetchAllDocuments(true);
  } catch (error) {
    console.error('清理和重新获取文档时出错:', error);
    throw error;
  }
}

/**
 * 获取文档源统计信息
 */
export function getDocumentStats(): { total: number, bySource: Record<string, number>, byCategory: Record<string, number> } {
  const docs = loadCachedDocuments() || [];
  
  // 按来源统计
  const bySource: Record<string, number> = {};
  // 按类别统计
  const byCategory: Record<string, number> = {};
  
  for (const doc of docs) {
    // 按来源统计
    if (!bySource[doc.source]) {
      bySource[doc.source] = 0;
    }
    bySource[doc.source]++;
    
    // 按类别统计
    if (!byCategory[doc.category]) {
      byCategory[doc.category] = 0;
    }
    byCategory[doc.category]++;
  }
  
  return {
    total: docs.length,
    bySource,
    byCategory
  };
}

/**
 * 运行文档诊断
 */
export function runDocumentDiagnostics(): { status: 'ok' | 'warning' | 'error', message: string, stats: ReturnType<typeof getDocumentStats> } {
  try {
    // 获取文档统计信息
    const stats = getDocumentStats();
    
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let message = '';
    
    // 检查文档总数
    if (stats.total === 0) {
      status = 'error';
      message = '没有找到任何文档。请运行 cleanAndRefetchDocuments() 重新获取文档。';
    } else if (stats.total < 50) { // 假设至少应该有50个文档片段
      status = 'warning';
      message = `文档数量较少 (${stats.total})，可能影响查询质量。考虑添加更多文档或检查网络连接。`;
    }
    
    // 检查不同来源的文档数量
    const sourceCount = Object.keys(stats.bySource).length;
    if (sourceCount < 3) { // 假设至少应该有3个不同来源
      if (status !== 'error') {
        status = 'warning';
      }
      message += (message ? ' ' : '') + `文档来源较少 (${sourceCount})，建议添加更多文档来源。`;
    }
    
    // 如果一切正常
    if (status === 'ok') {
      message = `文档系统状态良好，共有 ${stats.total} 个文档片段，来自 ${sourceCount} 个不同来源。`;
    }
    
    return { status, message, stats };
  } catch (error) {
    return {
      status: 'error',
      message: `运行诊断时出错: ${error.message || error}`,
      stats: { total: 0, bySource: {}, byCategory: {} }
    };
  }
}

// 如果直接运行这个文件，提供诊断和重新获取功能
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const args = process.argv.slice(2);
  const command = args[0] || 'fetch';
  
  if (command === 'fetch') {
    console.log('获取和保存所有文档...');
    fetchAllDocuments(true)
      .then(docs => console.log(`文档获取和保存完成，共 ${docs.length} 个文档片段`))
      .catch((error) => console.error('获取文档时出错:', error));
  } else if (command === 'clean') {
    console.log('清理并重新获取所有文档...');
    cleanAndRefetchDocuments()
      .then(docs => console.log(`文档清理和重新获取完成，共 ${docs.length} 个文档片段`))
      .catch((error) => console.error('清理和重新获取文档时出错:', error));
  } else if (command === 'diagnose') {
    console.log('运行文档诊断...');
    const result = runDocumentDiagnostics();
    console.log(`诊断状态: ${result.status}`);
    console.log(`诊断消息: ${result.message}`);
    console.log('文档统计:');
    console.log(`- 总数: ${result.stats.total}`);
    console.log('- 按来源:');
    Object.entries(result.stats.bySource).forEach(([source, count]) => {
      console.log(`  - ${source}: ${count}`);
    });
    console.log('- 按类别:');
    Object.entries(result.stats.byCategory).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count}`);
    });
  } else if (command === 'help') {
    console.log(`
CKB文档处理模块命令行工具

用法:
  tsx src/lib/ckbDocuments.ts [命令]

命令:
  fetch     获取和保存所有文档（默认）
  clean     清理并重新获取所有文档
  diagnose  运行文档诊断
  help      显示帮助信息
    `);
  } else if (command === 'github-status') {
    console.log('检查GitHub API状态...');
    fetchWithRetry('https://api.github.com/rate_limit', {
      headers: getGitHubHeaders()
    })
      .then(response => {
        if (response.status === 200) {
          interface RateLimitResponse {
            resources: {
              [key: string]: {
                limit: number;
                used: number;
                remaining: number;
                reset: number;
              }
            };
            rate: {
              limit: number;
              used: number;
              remaining: number;
              reset: number;
            };
          }
          
          const { resources, rate } = response.data as RateLimitResponse;
          console.log('GitHub API状态:');
          console.log(`认证状态: ${USE_GITHUB_AUTH ? '已认证' : '未认证'}`);
          console.log(`总速率限制: ${rate.limit} 请求/小时`);
          console.log(`已使用: ${rate.used} 请求`);
          console.log(`剩余: ${rate.remaining} 请求`);
          console.log(`重置时间: ${new Date(rate.reset * 1000).toLocaleString()}`);
          
          console.log('\n各资源限制:');
          for (const [resource, limits] of Object.entries(resources)) {
            console.log(`- ${resource}: ${limits.remaining}/${limits.limit}`);
          }
        }
      })
      .catch(error => console.error('获取GitHub API状态时出错:', error));
  } else {
    console.error(`未知命令: ${command}`);
    console.log('可用命令: fetch, clean, diagnose, help');
  }
} 