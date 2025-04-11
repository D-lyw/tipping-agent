/**
 * CKB生态文档处理模块 - 文档分块处理器 目前暂未使用，均由各自 scraper 内部处理
 * 
 * 实现智能文档分块功能，根据文档结构和内容特性自动分块
 */

import { DocumentChunk } from '../core/types';
import { createLogger } from '../utils/logger';
import { splitIntoChunks, splitIntoParagraphs } from '../utils/helpers';
import { DEFAULT_CHUNK_SIZE, MIN_CHUNK_LENGTH } from '../core/config';

// 初始化日志记录器
const logger = createLogger('Chunker');

/**
 * 分块配置选项
 */
export interface ChunkingOptions {
  /** 最大块大小（字符数） */
  maxChunkSize?: number;
  /** 最小块大小（字符数） */
  minChunkSize?: number;
  /** 是否保留标题 */
  preserveHeadings?: boolean;
  /** 是否保留代码块 */
  preserveCodeBlocks?: boolean;
  /** 是否按段落分割 */
  splitByParagraph?: boolean;
  /** 分隔符 */
  separator?: string;
}

/**
 * 默认分块配置
 */
const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxChunkSize: DEFAULT_CHUNK_SIZE,
  minChunkSize: MIN_CHUNK_LENGTH,
  preserveHeadings: true,
  preserveCodeBlocks: true,
  splitByParagraph: true,
  separator: '\n\n'
};

/**
 * 智能文档分块
 * 
 * @param content 文档内容
 * @param options 分块选项
 * @returns 分块后的文本数组
 */
export function chunkDocument(
  content: string,
  options: ChunkingOptions = {}
): string[] {
  // 合并选项
  const mergedOptions: ChunkingOptions = {
    ...DEFAULT_CHUNKING_OPTIONS,
    ...options
  };
  
  const {
    maxChunkSize,
    minChunkSize,
    preserveHeadings,
    preserveCodeBlocks,
    splitByParagraph,
    separator
  } = mergedOptions;
  
  if (!content || content.trim().length === 0) {
    return [];
  }
  
  // 预处理：保留代码块
  let processedContent = content;
  const codeBlocks: string[] = [];
  
  if (preserveCodeBlocks) {
    // 提取并替换代码块（用于Markdown）
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = processedContent.match(codeBlockRegex) || [];
    
    for (let i = 0; i < matches.length; i++) {
      const placeholder = `__CODE_BLOCK_${i}__`;
      codeBlocks.push(matches[i]);
      processedContent = processedContent.replace(matches[i], placeholder);
    }
  }
  
  // 分割文档
  let chunks: string[] = [];
  
  if (splitByParagraph) {
    // 按段落分割
    const paragraphs = splitIntoParagraphs(processedContent);
    
    // 将段落重新组合成块
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // 如果是标题并且需要保留标题结构
      const isHeading = /^#{1,6}\s+.+$/m.test(paragraph);
      
      if (preserveHeadings && isHeading) {
        // 如果当前块不为空，保存它
        if (currentChunk.length >= minChunkSize) {
          chunks.push(currentChunk);
        }
        // 开始新块，以标题开始
        currentChunk = paragraph;
      }
      // 如果添加当前段落会超出最大块大小
      else if (currentChunk.length + paragraph.length + separator.length > maxChunkSize) {
        // 如果当前块不为空，保存它
        if (currentChunk.length >= minChunkSize) {
          chunks.push(currentChunk);
        }
        // 开始新块
        currentChunk = paragraph;
      }
      // 否则，将段落添加到当前块
      else {
        if (currentChunk.length > 0) {
          currentChunk += separator;
        }
        currentChunk += paragraph;
      }
    }
    
    // 添加最后一个块（如果有）
    if (currentChunk.length >= minChunkSize) {
      chunks.push(currentChunk);
    }
  } else {
    // 简单地按最大大小分割
    chunks = splitIntoChunks(processedContent, { maxChunkSize });
  }
  
  // 后处理：恢复代码块
  if (preserveCodeBlocks && codeBlocks.length > 0) {
    for (let i = 0; i < chunks.length; i++) {
      for (let j = 0; j < codeBlocks.length; j++) {
        const placeholder = `__CODE_BLOCK_${j}__`;
        chunks[i] = chunks[i].replace(placeholder, codeBlocks[j]);
      }
    }
  }
  
  // 过滤掉过小的块
  return chunks.filter(chunk => chunk.trim().length >= minChunkSize);
}

/**
 * 优化文档块集合
 * 处理重叠内容、合并过小的块、确保上下文的连贯性
 */
export function optimizeChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  logger.info(`开始优化 ${chunks.length} 个文档块`);
  
  if (chunks.length <= 1) {
    return chunks;
  }
  
  // 按来源和类别分组
  const groupedChunks: Record<string, DocumentChunk[]> = {};
  
  chunks.forEach(chunk => {
    const key = `${chunk.source}:${chunk.category}`;
    if (!groupedChunks[key]) {
      groupedChunks[key] = [];
    }
    groupedChunks[key].push(chunk);
  });
  
  // 对每个组优化
  const optimizedChunks: DocumentChunk[] = [];
  
  Object.values(groupedChunks).forEach(group => {
    // 按创建时间排序
    group.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    
    // 合并过小的相邻块
    const merged = mergeSmallChunks(group);
    
    // 去除重复内容
    const deduped = deduplicateChunks(merged);
    
    optimizedChunks.push(...deduped);
  });
  
  logger.info(`优化后的文档块数量: ${optimizedChunks.length}`);
  return optimizedChunks;
}

/**
 * 合并小块
 */
function mergeSmallChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  
  const result: DocumentChunk[] = [];
  let current: DocumentChunk | null = null;
  
  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }
    
    // 如果当前块太小或与下一个块属于同一个上下文
    if (
      current.content.length < MIN_CHUNK_LENGTH ||
      (current.title === chunk.title && current.url === chunk.url)
    ) {
      // 合并内容
      current.content += '\n\n' + chunk.content;
      // 更新元数据
      current.metadata = {
        ...(current.metadata || {}),
        mergedWith: chunk.id
      };
    } else {
      // 保存当前块，开始新块
      result.push(current);
      current = { ...chunk };
    }
  }
  
  // 添加最后一个块
  if (current) {
    result.push(current);
  }
  
  return result;
}

/**
 * 去除重复内容
 */
function deduplicateChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  // 简单去重：比较内容的前100个字符
  const seen = new Set<string>();
  const result: DocumentChunk[] = [];
  
  for (const chunk of chunks) {
    const contentStart = chunk.content.substring(0, 100).trim();
    if (!seen.has(contentStart)) {
      seen.add(contentStart);
      result.push(chunk);
    }
  }
  
  return result;
} 