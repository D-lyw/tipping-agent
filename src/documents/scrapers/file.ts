/**
 * CKB生态文档处理模块 - 本地文件处理器
 * 负责处理本地文件，生成文档块
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types.js';
import { createLogger } from '../utils/logger.js';
import { createDocumentId, splitIntoChunks } from '../utils/helpers.js';
import { createResourceNotFoundError, safeExecute, DocumentProcessingError } from '../utils/errors.js';
import { 
  MIN_CHUNK_LENGTH,
  CODE_EXTENSIONS,
  OPENAI_API_KEY,
  PG_CONNECTION_STRING,
  PG_VECTOR_TABLE,
  FILE_CHUNK_BATCH_SIZE,
  FILE_MAX_FILES_PER_BATCH,
  FILE_MAX_FILES_PER_DIR,
  FILE_MAX_SIZE_KB,
  FILE_MAX_DIRS
} from '../core/config.js';
import { MastraVectorStore } from '../storage/mastra-vector-store.js';
import * as dotenv from 'dotenv';
import { MemoryManager } from '../../utils/memory.js';

// 加载环境变量
dotenv.config();

// 文件系统的Promise版API
const readFileAsync = util.promisify(fs.readFile);
const statAsync = util.promisify(fs.stat);
const readdirAsync = util.promisify(fs.readdir);

// 初始化日志记录器
const logger = createLogger('FileScraper');

/**
 * 处理本地文件 - 流式处理直接向量存储版本
 */
export async function processLocalFile(source: DocumentSource): Promise<ScrapingResult> {
  logger.info(`处理本地文件: ${source.filePath || source.url}`);
  const startTime = Date.now();
  
  // 统计信息
  const stats = {
    totalChunks: 0,
    storedChunks: 0,
    processedFiles: 0,
    skippedFiles: 0,
    pendingChunks: 0,
    timeMs: 0
  };
  
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
    
    logger.info('向量存储初始化成功，开始处理本地文件');
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
  
  // 内存中积累的文档块
  const pendingChunks: DocumentChunk[] = [];
  
  // 内部函数，处理文档块
  const handleChunks = async (chunks: DocumentChunk[]): Promise<void> => {
    if (!chunks || chunks.length === 0) return;
    
    // 更新统计信息
    stats.totalChunks += chunks.length;
    
    // 添加到待处理队列
    pendingChunks.push(...chunks);
    stats.pendingChunks = pendingChunks.length;
    
    // 如果待处理队列超过最大数量，立即处理
    if (pendingChunks.length >= FILE_CHUNK_BATCH_SIZE) {
      await processAccumulatedChunks();
    }
  };
  
  // 处理积累的文档块
  const processAccumulatedChunks = async (): Promise<void> => {
    if (pendingChunks.length === 0 || !vectorStore) return;
    
    logger.info(`向量化并存储 ${pendingChunks.length} 个文档块...`);
    
    // 复制队列并清空
    const chunksToProcess = [...pendingChunks];
    pendingChunks.length = 0;
    stats.pendingChunks = 0;
    
    try {
      // 存储文档
      const startTime = Date.now();
      const storedCount = await vectorStore.storeDocuments(chunksToProcess);
      const endTime = Date.now();
      
      stats.storedChunks += storedCount;
      logger.info(`成功向量化并存储 ${storedCount}/${chunksToProcess.length} 个文档块，耗时 ${endTime - startTime}ms`);
      
      // 释放内存
      if (global.gc) {
        try {
          global.gc();
        } catch (e) {
          // 忽略错误
        }
      }
    } catch (error) {
      logger.error('向量化和存储文档时出错:', error);
    }
  };
  
  return await safeExecute<ScrapingResult, Error>(async () => {
    // 确定文件路径
    const filePath = source.filePath || source.url;
    
    // 检查文件是否存在
    try {
      await statAsync(filePath);
    } catch (error) {
      throw createResourceNotFoundError(`文件不存在: ${filePath}`);
    }
    
    try {
      const stat = await statAsync(filePath);
      
      if (stat.isDirectory()) {
        // 处理目录
        logger.info(`检测到目录: ${filePath}，开始递归处理`);
        await processLocalDirectoryStream(filePath, source.name, handleChunks, stats);
      } else {
        // 处理单个文件
        // 确定文件类型
        const fileType = source.fileType || inferFileType(filePath);
        logger.info(`文件类型为: ${fileType}`);
        
        // 检查文件大小
        if (stat.size > FILE_MAX_SIZE_KB * 1024) {
          logger.warn(`跳过过大文件: ${filePath} (${Math.round(stat.size/1024)}KB > ${FILE_MAX_SIZE_KB}KB)`);
          stats.skippedFiles++;
        } else {
          // 读取文件内容
          const content = await readFileAsync(filePath, 'utf8');
          
          // 根据文件类型处理内容
          const chunks: DocumentChunk[] = [];
          
          switch (fileType) {
            case 'markdown':
              processMarkdownContent(content, path.basename(filePath), filePath, source.name, chunks);
              break;
            case 'text':
              processTextContent(content, path.basename(filePath), filePath, source.name, chunks);
              break;
            case 'pdf':
              // PDF处理需要额外的库，这里简单处理为纯文本
              processTextContent(content, path.basename(filePath), filePath, source.name, chunks);
              break;
            default:
              processTextContent(content, path.basename(filePath), filePath, source.name, chunks);
          }
          
          stats.processedFiles++;
          
          // 使用流式处理
          await handleChunks(chunks);
        }
      }
      
      // 在结束前，确保所有待处理的文档块都被处理
      await processAccumulatedChunks();
      
      // 释放向量存储资源
      if (vectorStore) {
        try {
          await vectorStore.close();
        } catch (error) {
          logger.warn('关闭向量存储时出错:', error);
        }
      }
      
      stats.timeMs = Date.now() - startTime;
      logger.info(`从 ${filePath} 提取并存储了 ${stats.totalChunks} 个文档片段，` +
        `成功存储了 ${stats.storedChunks} 个文档片段，` +
        `处理了 ${stats.processedFiles} 个文件，跳过了 ${stats.skippedFiles} 个文件，` + 
        `耗时 ${stats.timeMs}ms`);
      
      return {
        success: true,
        chunks: [], // 使用向量存储直接处理，不返回文档块
        message: `成功处理并存储本地文件 ${filePath}`,
        stats: {
          totalChunks: stats.totalChunks,
          storedChunks: stats.storedChunks,
          totalPages: stats.processedFiles,
          timeMs: stats.timeMs
        }
      };
    } catch (error) {
      // 确保在发生错误时也处理所有待处理的文档块
      if (pendingChunks.length > 0 && vectorStore) {
        processAccumulatedChunks().catch(e => 
          logger.error(`处理剩余文档块时出错:`, e)
        );
      }
      
      // 关闭向量存储
      if (vectorStore) {
        vectorStore.close().catch(e => 
          logger.error('关闭向量存储时出错:', e)
        );
      }
      
      throw error;
    }
  }, (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false as false,
      chunks: [],
      error: error instanceof DocumentProcessingError ? error : createResourceNotFoundError(errorMessage),
      message: `处理文件失败: ${errorMessage}`,
      stats: {
        totalChunks: stats.totalChunks,
        storedChunks: stats.storedChunks,
        totalPages: stats.processedFiles,
        timeMs: Date.now() - startTime
      }
    } as any;
  });
}

/**
 * 流式处理本地目录
 */
async function processLocalDirectoryStream(
  directoryPath: string, 
  sourceName: string,
  chunkHandler: (chunks: DocumentChunk[]) => Promise<void>,
  stats: any
): Promise<void> {
  logger.info(`流式处理本地目录: ${directoryPath}`);
  
  try {
    // 读取目录内容
    const entries = await readdirAsync(directoryPath, { withFileTypes: true });
    
    // 首先处理文件
    const files = entries
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .filter(file => inferFileType(file.name) !== 'unknown')
      .slice(0, FILE_MAX_FILES_PER_DIR); // 限制每个目录处理的文件数量
    
    // 批量处理文件
    for (let i = 0; i < files.length; i += FILE_MAX_FILES_PER_BATCH) {
      // 记录内存使用情况
      logMemoryUsage(`开始处理批次 ${Math.floor(i/FILE_MAX_FILES_PER_BATCH) + 1}/${Math.ceil(files.length/FILE_MAX_FILES_PER_BATCH)}`);
      
      const batch = files.slice(i, i + FILE_MAX_FILES_PER_BATCH);
      logger.info(`处理批次 ${Math.floor(i/FILE_MAX_FILES_PER_BATCH) + 1}/${Math.ceil(files.length/FILE_MAX_FILES_PER_BATCH)}，共 ${batch.length} 个文件`);
      
      // 逐个处理文件，不再使用Promise.all并行处理，避免瞬时内存使用过高
      for (const file of batch) {
        const filePath = path.join(directoryPath, file.name);
        
        try {
          // 检查文件大小
          const stats_file = await statAsync(filePath);
          if (stats_file.size > FILE_MAX_SIZE_KB * 1024) {
            logger.warn(`跳过过大文件: ${filePath} (${Math.round(stats_file.size/1024)}KB > ${FILE_MAX_SIZE_KB}KB)`);
            stats.skippedFiles++;
            continue;
          }
          
          // 使用let而不是const声明content，这样可以在后面将其设置为null
          let content = await readFileAsync(filePath, 'utf8');
          const fileType = inferFileType(file.name);
          
          const chunks: DocumentChunk[] = [];
          
          switch (fileType) {
            case 'markdown':
              processMarkdownContent(content, file.name, filePath, sourceName, chunks);
              break;
            case 'text':
              processTextContent(content, file.name, filePath, sourceName, chunks);
              break;
            default:
              processTextContent(content, file.name, filePath, sourceName, chunks);
          }
          
          // 手动释放大字符串的内存
          content = null;
          
          if (chunks.length > 0) {
            logger.info(`从文件 ${file.name} 中提取了 ${chunks.length} 个文档块`);
            stats.processedFiles++;
            
            // 使用流式处理
            await chunkHandler(chunks);
          }
          
          // 每处理一个文件后尝试进行垃圾回收
          if (global.gc) {
            global.gc();
          }
        } catch (error) {
          logger.warn(`处理文件 ${filePath} 时出错: ${error.message}`);
        }
      }
      
      // 强制进行垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      // 记录当前内存使用情况
      logMemoryUsage(`完成批次 ${Math.floor(i/FILE_MAX_FILES_PER_BATCH) + 1}/${Math.ceil(files.length/FILE_MAX_FILES_PER_BATCH)}`);
      
      // 添加延迟，确保有时间释放内存
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 然后递归处理子目录，但限制子目录数量
    const directories = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .slice(0, FILE_MAX_DIRS);
    
    // 逐个处理子目录，不再并行处理
    for (const dir of directories) {
      logMemoryUsage(`开始处理子目录: ${dir.name}`);
      const subdirPath = path.join(directoryPath, dir.name);
      
      await processLocalDirectoryStream(subdirPath, sourceName, chunkHandler, stats);
      
      // 强制进行垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      logMemoryUsage(`完成处理子目录: ${dir.name}`);
    }
    
  } catch (error) {
    logger.error(`处理目录 ${directoryPath} 时出错: ${error.message}`);
  }
}

/**
 * 记录当前内存使用情况
 */
function logMemoryUsage(context: string): void {
  if (typeof process.memoryUsage !== 'function') return;
  
  const { rss, heapTotal, heapUsed } = process.memoryUsage();
  logger.info(
    `内存使用 [${context}]: RSS: ${Math.round(rss / 1024 / 1024)}MB, ` +
    `堆总量: ${Math.round(heapTotal / 1024 / 1024)}MB, ` +
    `堆已用: ${Math.round(heapUsed / 1024 / 1024)}MB`
  );
}

/**
 * 根据文件名推断文件类型
 */
function inferFileType(filePath: string): 'markdown' | 'text' | 'pdf' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  
  if (['.md', '.markdown'].includes(ext)) {
    return 'markdown';
  } else if (['.txt', '.text', '.html', '.htm', '.xml', '.json', '.csv'].includes(ext)) {
    return 'text';
  } else if (ext === '.pdf') {
    return 'pdf';
  } else {
    return 'unknown';
  }
}

/**
 * 处理Markdown内容
 */
function processMarkdownContent(
  content: string,
  fileName: string,
  filePath: string,
  sourceName: string,
  chunks: DocumentChunk[]
): void {
  if (!content || content.trim().length < MIN_CHUNK_LENGTH) {
    return;
  }
  
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
        url: `file://${filePath}`,
        source: sourceName,
        category: 'documentation',
        createdAt: Date.now(),
        metadata: {
          scraper: 'file',
          fileType: 'markdown',
          fileName,
          filePath
        }
      });
    }
  }
}

/**
 * 处理文本内容
 */
function processTextContent(
  content: string,
  fileName: string,
  filePath: string,
  sourceName: string,
  chunks: DocumentChunk[]
): void {
  if (!content || content.trim().length < MIN_CHUNK_LENGTH) {
    return;
  }
  
  const title = fileName;
  
  // 将文本拆分为段落
  const paragraphs = content
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  // 合并段落为更大的块，然后再分割为适当大小
  const processedChunks = splitIntoChunks(paragraphs.join('\n\n'));
  
  for (let i = 0; i < processedChunks.length; i++) {
    const chunk = processedChunks[i];
    if (chunk.length < MIN_CHUNK_LENGTH) continue;
    
    const id = createDocumentId(`${sourceName}-${title}-${i}`, Date.now());
    
    chunks.push({
      id,
      content: chunk,
      title,
      url: `file://${filePath}`,
      source: sourceName,
      category: 'documentation',
      createdAt: Date.now(),
      metadata: {
        scraper: 'file',
        fileType: 'text',
        fileName,
        filePath
      }
    });
  }
} 