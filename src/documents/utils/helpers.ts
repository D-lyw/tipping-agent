/**
 * CKB生态文档处理模块 - 通用工具函数
 */

import * as crypto from 'crypto';

/**
 * 生成唯一ID
 */
export function generateId(prefix: string = '', length: number = 8): string {
  const randomPart = crypto.randomBytes(length).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${prefix}${prefix ? '-' : ''}${timestamp}-${randomPart}`;
}

/**
 * 创建文档ID
 */
export function createDocumentId(source: string, counter: number): string {
  const sourceId = source.toLowerCase().replace(/\s+/g, '-');
  return `${sourceId}-${counter}`;
}

/**
 * 延迟指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 精简文本内容（删除多余空格和换行）
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * 提取URL中的域名
 */
export function extractDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname;
  } catch (e) {
    return '';
  }
}

/**
 * 拆分文本为段落
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * 将文本分割成块
 */
export function splitIntoChunks(text: string, options: { 
  maxChunkSize?: number; 
  minChunkSize?: number;
  overlapSize?: number;
} = {}): string[] {
  // 配置参数
  const maxChunkSize = options.maxChunkSize || 2000; // 更小的最大块大小，避免OpenAI上下文限制
  const minChunkSize = options.minChunkSize || 200;
  const overlapSize = options.overlapSize || 100;

  // 处理空文本
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 按段落分割
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // 如果段落本身就超过了最大块大小，需要进一步分割
    if (paragraph.length > maxChunkSize) {
      // 如果当前块非空，先添加到结果中
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // 分割大段落
      let startPos = 0;
      while (startPos < paragraph.length) {
        // 尝试在句子边界分割
        const endPos = Math.min(startPos + maxChunkSize, paragraph.length);
        let splitPos = endPos;

        // 尝试在句号、问号或感叹号处分割
        if (endPos < paragraph.length) {
          const sentenceEndMatch = paragraph.substring(startPos, endPos).match(/[.!?][^.!?]*$/);
          if (sentenceEndMatch) {
            splitPos = startPos + sentenceEndMatch.index + 1;
          }
        }

        chunks.push(paragraph.substring(startPos, splitPos).trim());
        startPos = splitPos - overlapSize; // 添加一些重叠以维持上下文
        if (startPos < 0) startPos = 0;
      }
    } 
    // 如果添加此段落会超出最大块大小，添加当前块并开始新块
    else if (currentChunk.length + paragraph.length + 1 > maxChunkSize) {
      if (currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk.trim());
        // 保留一部分重叠内容到下一个块，确保上下文连贯
        const lastSentenceMatch = currentChunk.match(/[.!?][^.!?]*$/);
        if (lastSentenceMatch && lastSentenceMatch.index > currentChunk.length - overlapSize) {
          currentChunk = currentChunk.substring(lastSentenceMatch.index + 1);
        } else {
          const words = currentChunk.split(' ');
          if (words.length > 10) {
            currentChunk = words.slice(-5).join(' '); // 保留最后几个单词
          } else {
            currentChunk = "";
          }
        }
      } else {
        // 如果当前块太小，继续添加
        currentChunk += "\n" + paragraph;
        continue;
      }
    }

    // 添加段落到当前块
    if (currentChunk.length > 0) {
      currentChunk += "\n";
    }
    currentChunk += paragraph;
  }

  // 添加最后一个块
  if (currentChunk.length >= minChunkSize) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 从URL中提取仓库信息
 */
export function parseGitHubUrl(url: string): { owner: string, repo: string } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    return null;
  }
  
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, '').split('/')[0]
  };
} 