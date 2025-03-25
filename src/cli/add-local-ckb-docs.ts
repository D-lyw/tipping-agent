#!/usr/bin/env node
/**
 * CKB本地文档添加命令行工具
 * 
 * 用法:
 *   添加单个文件: node add-local-ckb-docs.ts file <文件路径> <文档名称> [文件类型]
 *   添加整个目录: node add-local-ckb-docs.ts dir <目录路径> [文档名称前缀] [是否递归]
 */

import { createDocumentManager } from '../documents';
import * as path from 'path';

async function showHelp() {
  console.log(`
CKB本地文档添加工具

用法:
  添加单个文件: node add-local-ckb-docs.ts file <文件路径> <文档名称> [文件类型]
  添加整个目录: node add-local-ckb-docs.ts dir <目录路径> [文档名称前缀] [是否递归]

参数:
  file          添加单个文件
  dir           添加整个目录
  <文件路径>     要添加的文件的路径
  <目录路径>     要添加的目录的路径
  <文档名称>     文档在系统中显示的名称
  [文档名称前缀] 目录中各文件的文档名称前缀，默认为"CKB本地文档"
  [文件类型]     text, markdown 或 pdf，默认自动检测
  [是否递归]     true 或 false，默认为 true

示例:
  node add-local-ckb-docs.ts file ./docs/whitepaper.md "CKB白皮书" markdown
  node add-local-ckb-docs.ts dir ./my-ckb-docs "我的CKB文档" true
  `);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    await showHelp();
    return;
  }
  
  const command = args[0];
  
  try {
    // 创建文档管理器
    const documentManager = createDocumentManager();
    await documentManager.initialize();
    
    if (command === 'file') {
      // 添加单个文件
      if (args.length < 3) {
        console.error('错误: 添加文件需要指定文件路径和文档名称');
        await showHelp();
        return;
      }
      
      const filePath = path.resolve(args[1]);
      const docName = args[2];
      const fileType = args[3] as 'text' | 'markdown' | 'pdf' || undefined;
      
      // 创建文件源配置
      const source = {
        name: docName,
        type: 'file' as const,
        url: `file://${filePath}`,
        filePath: filePath,
        fileType: fileType,
        enabled: true
      };
      
      // 添加文档源
      documentManager.addDocumentSource(source);
      
      // 抓取该文档源
      const result = await documentManager.fetchSingleSource(source);
      
      if (result.success) {
        console.log(`成功添加文件: ${docName}`);
        console.log(`文档已分割为 ${result.chunks.length} 个片段`);
      } else {
        console.error(`添加文件失败: ${result.message}`);
      }
    } else if (command === 'dir') {
      // 添加整个目录
      if (args.length < 2) {
        console.error('错误: 添加目录需要指定目录路径');
        await showHelp();
        return;
      }
      
      const dirPath = path.resolve(args[1]);
      const namePrefix = args[2] || 'CKB本地文档';
      const recursive = args[3] !== 'false';
      
      // 使用文档管理器处理本地目录
      const chunks = await documentManager.addLocalDirectory(dirPath, namePrefix);
      
      if (chunks.length > 0) {
        console.log(`成功添加 ${chunks.length} 个文档片段`);
      } else {
        console.error(`未能从目录 ${dirPath} 提取任何文档`);
      }
    } else {
      console.error(`未知命令: ${command}`);
      await showHelp();
    }
  } catch (error) {
    console.error('添加本地文档时出错:', error);
  }
}

// 运行主函数
main().catch(error => console.error('程序执行出错:', error)); 