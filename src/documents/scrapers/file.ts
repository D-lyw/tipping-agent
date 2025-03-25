/**
 * CKB生态文档处理模块 - 本地文件处理器
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { DocumentChunk, DocumentSource, ScrapingResult } from '../core/types';
import { createLogger } from '../utils/logger';
import { createDocumentId, splitIntoChunks } from '../utils/helpers';
import { createResourceNotFoundError, safeExecute, DocumentProcessingError } from '../utils/errors';
import { MIN_CHUNK_LENGTH } from '../core/config';

// 文件系统的Promise版API
const readFileAsync = util.promisify(fs.readFile);
const statAsync = util.promisify(fs.stat);
const readdirAsync = util.promisify(fs.readdir);

// 初始化日志记录器
const logger = createLogger('FileScraper');

/**
 * 处理本地文件
 */
export async function processLocalFile(source: DocumentSource): Promise<ScrapingResult> {
  logger.info(`处理本地文件: ${source.filePath || source.url}`);
  const startTime = Date.now();
  
  return await safeExecute<ScrapingResult, Error>(async () => {
    // 确定文件路径
    const filePath = source.filePath || source.url;
    
    // 检查文件是否存在
    try {
      await statAsync(filePath);
    } catch (error) {
      throw createResourceNotFoundError(`文件不存在: ${filePath}`);
    }
    
    // 确定文件类型
    const fileType = source.fileType || inferFileType(filePath);
    logger.info(`文件类型为: ${fileType}`);
    
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
    
    const endTime = Date.now();
    logger.info(`从 ${filePath} 提取了 ${chunks.length} 个文档片段，耗时 ${endTime - startTime}ms`);
    
    return {
      success: true,
      chunks,
      message: `成功处理本地文件 ${filePath}`,
      stats: {
        totalChunks: chunks.length,
        timeMs: endTime - startTime
      }
    };
  }, (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false as false,
      chunks: [],
      error: error instanceof DocumentProcessingError ? error : createResourceNotFoundError(errorMessage),
      message: `处理文件失败: ${errorMessage}`,
      stats: {
        totalChunks: 0,
        timeMs: Date.now() - startTime
      }
    } as any;
  });
}

/**
 * 递归处理本地目录
 */
export async function processLocalDirectory(directoryPath: string, sourceName: string): Promise<DocumentChunk[]> {
  logger.info(`处理本地目录: ${directoryPath}`);
  
  const allChunks: DocumentChunk[] = [];
  const maxBatchSize = 10; // 减小每批处理的最大文件数，从20减小到10
  const maxFilesPerDirectory = 200; // 减小每个目录处理的最大文件数，从1000减小到200
  const maxFileSizeBytes = 500 * 1024; // 限制处理的最大文件大小为500KB

  try {
    // 读取目录内容
    const entries = await readdirAsync(directoryPath, { withFileTypes: true });
    
    // 首先处理文件
    const files = entries
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .filter(file => inferFileType(file.name) !== 'unknown')
      .slice(0, maxFilesPerDirectory); // 限制每个目录处理的文件数量
    
    // 批量处理文件
    for (let i = 0; i < files.length; i += maxBatchSize) {
      // 记录内存使用情况
      logMemoryUsage(`开始处理批次 ${Math.floor(i/maxBatchSize) + 1}/${Math.ceil(files.length/maxBatchSize)}`);
      
      const batch = files.slice(i, i + maxBatchSize);
      logger.info(`处理批次 ${Math.floor(i/maxBatchSize) + 1}/${Math.ceil(files.length/maxBatchSize)}，共 ${batch.length} 个文件`);
      
      // 逐个处理文件，不再使用Promise.all并行处理，避免瞬时内存使用过高
      const batchChunks: DocumentChunk[][] = [];
      for (const file of batch) {
        const filePath = path.join(directoryPath, file.name);
        const chunks: DocumentChunk[] = [];
        
        try {
          // 检查文件大小
          const stats = await statAsync(filePath);
          if (stats.size > maxFileSizeBytes) {
            logger.warn(`跳过过大文件: ${filePath} (${Math.round(stats.size/1024)}KB > ${Math.round(maxFileSizeBytes/1024)}KB)`);
            continue;
          }
          
          // 使用let而不是const声明content，这样可以在后面将其设置为null
          let content = await readFileAsync(filePath, 'utf8');
          const fileType = inferFileType(file.name);
          
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
          }
          
          // 每处理一个文件后尝试进行垃圾回收
          if (global.gc) {
            global.gc();
          }
        } catch (error) {
          logger.warn(`处理文件 ${filePath} 时出错: ${error.message}`);
        }
        
        batchChunks.push(chunks);
      }
      
      // 合并批次结果，每次只添加少量文档到结果中，避免大数组拼接
      for (const chunkArray of batchChunks) {
        // 分批添加，避免一次性合并大数组
        const maxChunksPerBatch = 50;
        for (let j = 0; j < chunkArray.length; j += maxChunksPerBatch) {
          allChunks.push(...chunkArray.slice(j, j + maxChunksPerBatch));
          // 添加延迟，让事件循环有机会处理其他操作
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // 清空批次临时数据
      // @ts-ignore
      batchChunks.length = 0;
      
      // 强制进行垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      // 记录当前内存使用情况
      logMemoryUsage(`完成批次 ${Math.floor(i/maxBatchSize) + 1}/${Math.ceil(files.length/maxBatchSize)}`);
      
      // 添加延迟，确保有时间释放内存
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 然后递归处理子目录，但限制子目录数量
    const maxSubdirectories = 20; // 限制子目录数量
    const directories = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .slice(0, maxSubdirectories);
    
    // 逐个处理子目录，不再并行处理
    for (const dir of directories) {
      logMemoryUsage(`开始处理子目录: ${dir.name}`);
      const subdirPath = path.join(directoryPath, dir.name);
      const subdirChunks = await processLocalDirectory(subdirPath, sourceName);
      
      // 分批添加子目录结果
      const maxChunksPerBatch = 50;
      for (let i = 0; i < subdirChunks.length; i += maxChunksPerBatch) {
        allChunks.push(...subdirChunks.slice(i, i + maxChunksPerBatch));
        // 添加短暂延迟
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // 强制进行垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      logMemoryUsage(`完成处理子目录: ${dir.name}`);
    }
    
  } catch (error) {
    logger.error(`处理目录 ${directoryPath} 时出错: ${error.message}`);
  }
  
  return allChunks;
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