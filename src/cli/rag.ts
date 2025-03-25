#!/usr/bin/env node

/**
 * CKB文档RAG系统命令行工具
 * 
 * 提供快速使用RAG功能的命令行接口
 */

import { main } from '../documents/rag/main';

// 执行主函数
main().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
}); 