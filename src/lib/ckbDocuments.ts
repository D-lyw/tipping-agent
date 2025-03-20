/**
 * CKB生态文档处理模块
 * 
 * 负责抓取、解析和准备CKB生态技术文档用于RAG系统
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// CKB文档源定义
interface DocumentSource {
  name: string;
  url: string;
  type: 'website' | 'github' | 'file';
  selector?: string; // CSS选择器，用于网站抓取
  enabled?: boolean; // 是否启用该源
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
    url: 'https://docs.nervos.org/docs/basics/introduction',
    type: 'website',
    selector: '.markdown',
    enabled: true
  }
];

// 本地缓存配置
const CACHE_DIR = path.join(process.cwd(), 'cache');
const DOCUMENTS_CACHE_FILE = path.join(CACHE_DIR, 'ckb-documents.json');

/**
 * 抓取网站内容
 */
async function scrapeWebsite(source: DocumentSource): Promise<DocumentChunk[]> {
  console.log(`抓取网站: ${source.url}`);
  const chunks: DocumentChunk[] = [];
  
  try {
    const response = await axios.get(source.url, {
      timeout: 10000, // 10秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CKB-Doc-Bot/1.0; +https://github.com/YourUsername/ckb-doc-qa-bot)'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // 使用指定的选择器，或默认选择主要内容
    const contentSelector = source.selector || 'body';
    const content = $(contentSelector).text();
    
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
    console.error(`抓取 ${source.url} 失败:`, error);
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
    
    // 尝试抓取多个文件
    const filesToTry = [
      `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
      // 尝试抓取RFC目录下的文件
      `https://raw.githubusercontent.com/${owner}/${repo}/master/rfcs/0001-positioning/0001-positioning.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/master/rfcs/0002-ckb/0002-ckb.md`,
    ];
    
    for (const fileUrl of filesToTry) {
      try {
        const response = await axios.get(fileUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CKB-Doc-Bot/1.0; +https://github.com/YourUsername/ckb-doc-qa-bot)'
          }
        });
        
        const content = response.data;
        
        // 分段处理Markdown内容
        const sections = content.split('\n## ');
        
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i].trim();
          if (section.length < 20) continue;
          
          // 尝试提取标题
          let title = i === 0 ? source.name : '';
          let sectionContent = section;
          
          const firstLineBreak = section.indexOf('\n');
          if (firstLineBreak > 0) {
            title = section.substring(0, firstLineBreak).trim();
            sectionContent = section.substring(firstLineBreak + 1).trim();
            if (i > 0) {
              title = '## ' + title; // 还原标题格式
            }
          }
          
          // 将长文档拆分为更小的块，大约每500-1000个字符
          const subSections = splitIntoChunks(sectionContent, 1000);
          
          for (let j = 0; j < subSections.length; j++) {
            const chunk = subSections[j];
            if (chunk.length < 20) continue;
            
            chunks.push({
              id: `${source.name.toLowerCase().replace(/\s+/g, '-')}-${i}-${j}`,
              content: chunk,
              title: title,
              url: fileUrl.replace('raw.githubusercontent.com', 'github.com').replace('/master/', '/blob/master/').replace('/main/', '/blob/main/'),
              source: source.name,
              category: 'github'
            });
          }
        }
      } catch (fileError) {
        // 单个文件抓取失败，继续尝试下一个
        console.log(`抓取 ${fileUrl} 失败，尝试下一个文件`);
      }
    }
    
    console.log(`从 ${source.url} 提取了 ${chunks.length} 个文档片段`);
  } catch (error) {
    console.error(`抓取 ${source.url} 失败:`, error);
  }
  
  return chunks;
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

// 直接调用入口点逻辑，适用于ES模块
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  console.log('直接运行ckbDocuments.ts，将获取和保存所有文档...');
  fetchAllDocuments(true)
    .then(() => console.log('文档获取和保存完成'))
    .catch((error) => console.error('获取文档时出错:', error));
} 