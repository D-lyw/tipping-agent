/**
 * CKB生态文档处理模块 - RAG系统主函数
 * 
 * 提供命令行接口用于测试和初始化RAG系统
 */

import { 
  indexAllDocuments, 
  rebuildIndex, 
  queryDocuments, 
  formatQueryResults,
  formatQueryResultsMarkdown
} from './index';
import { createLogger } from '../utils/logger';
import { fileURLToPath } from 'url';
import path from 'path';

// 初始化日志记录器
const logger = createLogger('RagMain');

/**
 * 主函数 - 用于初始化和测试
 */
export async function main() {
  try {
    // 获取命令行参数
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'index':
        // 索引所有文档
        logger.info('开始索引所有文档...');
        const indexedCount = await indexAllDocuments();
        logger.info(`索引完成，共索引了 ${indexedCount} 个文档片段`);
        break;
        
      case 'rebuild':
        // 重建索引
        logger.info('开始重建索引...');
        const rebuildCount = await rebuildIndex();
        logger.info(`索引重建完成，共索引了 ${rebuildCount} 个文档片段`);
        break;
        
      case 'query':
        // 查询文档
        const query = args[1] || "CKB是什么?";
        const limit = parseInt(args[2] || "5", 10);
        
        logger.info(`执行查询: "${query}" (限制: ${limit})`);
        const results = await queryDocuments(query, limit);
        
        if (args.includes('--markdown')) {
          console.log(formatQueryResultsMarkdown(results));
        } else {
          console.log(formatQueryResults(results));
        }
        
        logger.info(`查询完成，找到 ${results.length} 个结果`);
        break;
        
      default:
        console.log(`
CKB文档RAG系统命令行工具

用法:
  node -r ts-node/register src/documents/rag/main.ts [命令] [参数]

命令:
  index             索引所有文档
  rebuild           重建索引
  query [查询] [限制] 执行查询
  
选项:
  --markdown        使用Markdown格式输出结果

示例:
  node -r ts-node/register src/documents/rag/main.ts index
  node -r ts-node/register src/documents/rag/main.ts query "CKB共识机制" 3
  node -r ts-node/register src/documents/rag/main.ts query "Nervos DAO" --markdown
        `);
    }
  } catch (error) {
    logger.error('操作执行出错:', error);
    process.exit(1);
  }
}

// 直接运行时执行main函数
// 使用 ES 模块方式检查是否是主模块
const __filename = fileURLToPath(import.meta.url);
const executedFile = fileURLToPath(new URL(process.argv[1], import.meta.url).href);

// 如果当前文件是被直接执行的
if (path.basename(__filename) === path.basename(executedFile)) {
  main().catch(error => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
} 