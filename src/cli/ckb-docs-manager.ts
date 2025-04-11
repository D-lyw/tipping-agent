#!/usr/bin/env node
/**
 * CKB文档管理工具
 * 
 * 用于管理CKB文档源、获取文档、诊断文档状况等
 */

import { CKB_DOCUMENT_SOURCES, createDocumentManager } from '../documents';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import axios from 'axios';

// 加载环境变量
dotenv.config();

// 显示帮助信息
function showHelp() {
  console.log(`
CKB文档管理工具 - 用于管理CKB文档源、获取文档、诊断文档状况等

用法:
  tsx src/cli/ckb-docs-manager.ts <命令> [参数]

命令:
  fetch                        重新获取所有文档
  clean                        清理并重新获取所有文档
  diagnose                     诊断文档状况
  stats                        显示文档统计信息
  add-file <路径> <名称> [类型] 添加单个文件作为文档源
  add-dir <路径> [前缀] [递归]  添加整个目录的文件作为文档源
  setup                        初始化文档系统（创建目录和示例文件）
  github-status                检查GitHub API状态和速率限制
  help                         显示帮助信息

参数:
  <路径>   文件或目录的路径
  <名称>   文档在系统中显示的名称
  [类型]   文件类型: text, markdown, pdf（默认自动检测）
  [前缀]   目录中各文件的名称前缀（默认为"CKB本地文档"）
  [递归]   是否递归处理子目录: true, false（默认为true）

示例:
  tsx src/cli/ckb-docs-manager.ts fetch
  tsx src/cli/ckb-docs-manager.ts clean
  tsx src/cli/ckb-docs-manager.ts add-file ./docs/whitepaper.md "CKB白皮书"
  tsx src/cli/ckb-docs-manager.ts add-dir ./my-ckb-docs "我的CKB文档" true
  tsx src/cli/ckb-docs-manager.ts github-status
  `);
}

// 初始化文档系统
async function setupDocSystem() {
  console.log('初始化CKB文档系统...');

  // 创建数据目录
  const dataDir = path.join(process.cwd(), 'data', 'ckb-docs');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`创建数据目录: ${dataDir}`);
  }

  // 创建子目录
  const subDirs = ['whitepaper', 'rfcs', 'specs', 'tutorials', 'references'];
  for (const dir of subDirs) {
    const dirPath = path.join(dataDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`创建子目录: ${dirPath}`);
    }
  }

  // 创建README文件
  const readmePath = path.join(dataDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# CKB本地文档目录

这个目录用于存放CKB相关的本地文档，系统会自动加载此目录下的所有文件作为文档源。

## 如何使用

1. 将您的CKB相关文档（如白皮书、技术规范、开发指南等）放置在此目录下
2. 文档可以是以下格式：
   - Markdown文件 (.md, .markdown)
   - 文本文件 (.txt)
   - PDF文件 (.pdf)
   - 代码文件 (.js, .ts, .html, .css, .json)
3. 系统在启动或刷新文档索引时会自动加载这些文件
4. 无需任何额外配置或命令

## 目录结构

- whitepaper/  # 白皮书和基础概念文档
- rfcs/        # RFC文档
- specs/       # 技术规范
- tutorials/   # 教程和指南
- references/  # 参考资料

## 注意事项

1. 系统会递归处理所有子目录
2. 大文件会被自动分割成多个片段
3. 所有文档都会被存储在缓存中，以便快速检索
4. PDF文件目前只能提取纯文本内容，复杂格式可能会丢失
5. 更新文档后，需要运行 \`tsx src/cli/ckb-docs-manager.ts fetch\` 刷新文档索引
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log(`创建README文件: ${readmePath}`);
  }

  // 创建测试目录以避免pdf-parse错误
  const testDir = path.join(process.cwd(), 'test', 'data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`创建测试目录: ${testDir}`);

    // 创建空的PDF测试文件
    const pdfTestFile = path.join(testDir, '05-versions-space.pdf');
    if (!fs.existsSync(pdfTestFile)) {
      fs.writeFileSync(pdfTestFile, '');
      console.log(`创建PDF测试文件: ${pdfTestFile}`);
    }
  }

  console.log('初始化完成，现在可以将CKB相关文档放入 data/ckb-docs 目录了');

  // 诊断文档状况
  console.log('\n运行文档诊断...');
  const docManager = createDocumentManager();
  await docManager.initialize();

  return true;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help') {
    showHelp();
    return;
  }

  const command = args[0];

  try {
    // 创建文档管理器
    const docManager = createDocumentManager();
    await docManager.initialize();

    switch (command) {
      case 'fetch':
        console.log('获取所有文档...');
        await docManager.fetchAllSources();
        console.log(`文档获取完成`);
        break;

      case 'add-source':
        const res = await docManager.fetchSingleSource(CKB_DOCUMENT_SOURCES[0]);
        console.log(res);
        break;

      case 'clean':
        console.log('清理并重新获取所有文档...');
        await docManager.clearCache();
        await docManager.fetchAllSources();
        console.log(`文档清理和重新获取完成`);
        break;

      case 'diagnose':
        console.log('诊断文档状况...');
        let diagnoseResult = await docManager.runDiagnostics();
        console.log(diagnoseResult);
        break;

      case 'add-file':
        if (args.length < 3) {
          console.error('错误: 添加文件需要指定文件路径和文档名称');
          showHelp();
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
        docManager.addDocumentSource(source);

        // 获取该文档源
        console.log(`添加文件源: ${docName} (${filePath})`);
        const result = await docManager.fetchSingleSource(source);

        if (result.success) {
          console.log(`成功添加文件: ${docName} (${filePath})`);
          console.log(`文档已分割为 ${result.chunks.length} 个片段`);
        } else {
          console.error(`添加文件失败: ${result.message}`);
        }
        break;

      case 'add-dir':
        if (args.length < 2) {
          console.error('错误: 添加目录需要指定目录路径');
          showHelp();
          return;
        }

        const dirPath = path.resolve(args[1]);
        const namePrefix = args[2] || 'CKB本地文档';
        const recursive = args[3] !== 'false';

        console.log(`处理目录: ${dirPath}`);
        const dirChunks = await docManager.addLocalDirectory(dirPath, namePrefix);

        if (dirChunks.length > 0) {
          console.log(`成功添加目录，获取了 ${dirChunks.length} 个文档片段`);
        } else {
          console.error(`未能从目录 ${dirPath} 提取任何文档`);
        }
        break;

      case 'setup':
        await setupDocSystem();
        break;

      case 'github-status':
        console.log('检查GitHub API状态和速率限制...');
        try {
          const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
          const USE_GITHUB_AUTH = GITHUB_TOKEN.length > 0;

          // 创建请求头
          const headers: Record<string, string> = {
            'User-Agent': 'CKB-Doc-Bot/1.0',
            'Accept': 'application/vnd.github.v3+json'
          };

          if (USE_GITHUB_AUTH) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
          }

          // 请求GitHub API状态
          const response = await axios.get('https://api.github.com/rate_limit', { headers });

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

            // 添加说明性提示
            if (!USE_GITHUB_AUTH) {
              console.log('\n您当前未使用GitHub令牌认证，速率限制较低。');
              console.log('要提高API速率限制，请配置GITHUB_TOKEN环境变量。');
              console.log('详情请参考: docs/github-api-config.md');
            }
          }
        } catch (error) {
          console.error('获取GitHub API状态时出错:', error);
        }
        break;

      default:
        console.error(`未知命令: ${command}`);
        showHelp();
        break;
    }
  } catch (error) {
    console.error(`执行 ${command} 命令时出错:`, error);
  }
}

// 运行主函数
main().catch(error => console.error('程序执行出错:', error)); 