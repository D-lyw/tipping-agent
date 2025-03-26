#!/usr/bin/env node
/**
 * 文档流式处理命令行工具
 * 使用流式架构处理大型网站和文档，避免内存溢出
 * 支持网站和GitHub仓库的流式处理
 */

import fs from 'fs';
import path from 'path';
import { program } from 'commander';
import { DocumentSource, DocumentChunk } from '../documents/core/types.js';
import { DocumentProcessor, processDocumentSource, processDocumentSources } from '../documents/core/processor.js';
import { createLogger } from '../documents/utils/logger.js';
import { MastraVectorStore } from '../documents/storage/mastra-vector-store.js';
import * as dotenv from 'dotenv';
import { MemoryManager } from '../utils/memory.js';

// 加载环境变量
dotenv.config();

// 创建日志记录器
const logger = createLogger('StreamProcessCLI');

// 环境变量配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const PG_CONNECTION_STRING = process.env.PG_CONNECTION_STRING || '';
const PG_VECTOR_TABLE = process.env.PG_VECTOR_TABLE || 'document_embeddings';

// 设置命令行程序
program
  .name('stream-process')
  .description('CKB生态文档流式处理工具 - 内存优化版本')
  .version('1.0.0');

// 添加流式网站处理命令
program
  .command('website')
  .description('流式处理网站内容')
  .option('-u, --url <url>', '网站URL')
  .option('-n, --name <n>', '网站名称', '')
  .option('-s, --selector <s>', 'CSS选择器（可选）', '')
  .option('-b, --batch-size <size>', '批处理大小', '10')
  .option('-i, --interval <ms>', '批处理间隔(毫秒)', '200')
  .option('-m, --max-memory <mb>', '建议设置Node.js最大内存(MB)', '2048')
  .action(async (options) => {
    try {
      // 显示内存建议
      logger.info(`建议使用 --max-old-space-size=${options.maxMemory} --expose-gc 运行此工具以获得最佳性能`);
      
      // 检查命令行参数
      if (!options.url) {
        logger.error('错误: 必须指定网站URL (--url)');
        process.exit(1);
      }
      
      // 解析批处理参数
      const batchSize = parseInt(options.batchSize, 10);
      const interval = parseInt(options.interval, 10);
      
      // 自动提取网站名称（如果未提供）
      let siteName = options.name;
      if (!siteName) {
        try {
          const url = new URL(options.url);
          siteName = url.hostname;
        } catch {
          siteName = '网站文档';
        }
      }
      
      // 创建文档处理器实例
      const processor = new DocumentProcessor({
        batchSize: batchSize,
        processingInterval: interval,
        maxConcurrent: 1
      });
      
      // 初始化处理器
      await processor.initialize();
      
      // 创建网站文档源
      const source: DocumentSource = {
        name: siteName,
        url: options.url,
        type: 'website',
        selector: options.selector || undefined,
        enabled: true
      };
      
      logger.info(`开始流式处理网站: ${source.url}`);
      const result = await processor.streamProcessDocumentSource({
        type: source.type,
        source: {
          url: source.url,
          name: source.name
        }
      });
      
      if (result.success) {
        logger.info(`成功处理网站 ${source.name}`);
        logger.info(`生成文档块: ${result.stats?.totalChunks || 0}`);
        logger.info(`存储文档块: ${result.stats?.storedChunks || 0}`);
        logger.info(`处理耗时: ${result.stats?.timeMs || 0}ms`);
      } else {
        logger.error(`处理失败: ${result.message}`);
      }
      
    } catch (error) {
      logger.error('处理出错:', error);
      process.exit(1);
    }
  });

// 添加GitHub仓库处理命令
program
  .command('github')
  .description('流式处理GitHub仓库')
  .option('-u, --url <url>', 'GitHub仓库URL')
  .option('-n, --name <n>', '仓库名称', '')
  .option('-b, --batch-size <size>', '批处理大小', '10')
  .option('-i, --interval <ms>', '批处理间隔(毫秒)', '200')
  .option('-m, --max-memory <mb>', '建议设置Node.js最大内存(MB)', '4096')
  .option('-d, --max-depth <depth>', '最大目录深度', '3')
  .option('-f, --only-dirs <dirs>', '只处理指定目录(逗号分隔)', '')
  .option('-c, --chunk-size <size>', '文档块处理批次大小', '50')
  .option('--limit-files', '限制处理的文件数量', false)
  .option('--skip-code', '跳过处理代码文件', false)
  .action(async (options) => {
    try {
      // 显示内存建议
      logger.info(`建议使用 --max-old-space-size=${options.maxMemory} --expose-gc 运行此工具以获得最佳性能`);
      
      // 检查命令行参数
      if (!options.url) {
        logger.error('错误: 必须指定GitHub仓库URL (--url)');
        process.exit(1);
      }
      
      // 验证URL是否为GitHub仓库
      if (!options.url.includes('github.com')) {
        logger.error('错误: URL必须是GitHub仓库地址');
        process.exit(1);
      }
      
      // 解析批处理参数
      const batchSize = parseInt(options.batchSize, 10);
      const interval = parseInt(options.interval, 10);
      const maxDepth = parseInt(options.maxDepth, 10);
      const chunkSize = parseInt(options.chunkSize, 10);
      
      // 设置环境变量配置GitHub爬虫行为
      process.env.GITHUB_MAX_DEPTH = String(maxDepth);
      process.env.GITHUB_CHUNK_BATCH_SIZE = String(chunkSize);
      process.env.GITHUB_LIMIT_FILES = options.limitFiles ? 'true' : 'false';
      process.env.GITHUB_SKIP_CODE = options.skipCode ? 'true' : 'false';
      
      if (options.onlyDirs) {
        process.env.GITHUB_ONLY_DIRS = options.onlyDirs;
      }
      
      // 自动提取仓库名称（如果未提供）
      let repoName = options.name;
      if (!repoName) {
        const urlParts = options.url.split('/');
        if (urlParts.length >= 5) {
          repoName = `${urlParts[3]}/${urlParts[4]}`;
        } else {
          repoName = 'GitHub仓库';
        }
      }
      
      // 创建文档处理器实例
      const processor = new DocumentProcessor({
        batchSize: batchSize,
        processingInterval: interval,
        maxConcurrent: 1
      });
      
      // 初始化处理器
      await processor.initialize();
      
      // 创建GitHub文档源
      const source: DocumentSource = {
        name: repoName,
        url: options.url,
        type: 'github',
        enabled: true
      };
      
      logger.info(`开始流式处理GitHub仓库: ${source.url}`);
      const result = await processor.streamProcessDocumentSource({
        type: source.type,
        source: {
          url: source.url,
          name: source.name
        }
      });
      
      if (result.success) {
        logger.info(`成功处理仓库 ${source.name}`);
        logger.info(`生成文档块: ${result.stats?.totalChunks || 0}`);
        logger.info(`存储文档块: ${result.stats?.storedChunks || 0}`);
        logger.info(`处理耗时: ${result.stats?.timeMs || 0}ms`);
      } else {
        logger.error(`处理失败: ${result.message}`);
      }
      
    } catch (error) {
      logger.error('处理出错:', error);
      process.exit(1);
    }
  });

// 保留原有命令，但重命名为通用处理命令
program
  .command('process')
  .description('使用配置文件流式处理文档源（支持多种类型）')
  .option('-s, --source <path>', '单个文档源配置JSON文件路径')
  .option('-c, --config <path>', '多个文档源配置JSON文件路径')
  .option('-b, --batch-size <size>', '批处理大小', '15')
  .option('-i, --interval <ms>', '批处理间隔(毫秒)', '100')
  .option('-m, --max-memory <mb>', '建议设置Node.js最大内存(MB)', '4096')
  .action(async (options) => {
    try {
      // 显示内存建议
      logger.info(`建议使用 --max-old-space-size=${options.maxMemory} --expose-gc 运行此工具以获得最佳性能`);
      
      // 检查命令行参数
      if (!options.source && !options.config) {
        logger.error('错误: 必须指定处理源 (--source 或 --config)');
        process.exit(1);
      }
      
      // 解析批处理参数
      const batchSize = parseInt(options.batchSize, 10);
      const interval = parseInt(options.interval, 10);
      
      // 根据参数确定处理方式
      if (options.source) {
        // 处理单个文档源配置文件
        const sourcePath = path.resolve(options.source);
        
        if (!fs.existsSync(sourcePath)) {
          logger.error(`错误: 找不到文档源配置文件 ${sourcePath}`);
          process.exit(1);
        }
        
        const sourceConfig = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        
        logger.info(`开始流式处理文档源: ${sourceConfig.name} (${sourceConfig.type})`);
        const result = await processDocumentSource(sourceConfig, {
          batchSize: batchSize,
          processingInterval: interval,
          maxConcurrent: 1
        });
        
        if (result.success) {
          logger.info(`成功处理文档源 ${sourceConfig.name}`);
          logger.info(`生成文档块: ${result.stats?.totalChunks || 0}`);
          logger.info(`处理耗时: ${result.stats?.timeMs || 0}ms`);
        } else {
          logger.error(`处理文档源失败: ${result.message}`);
        }
      } else if (options.config) {
        // 处理多个文档源配置文件
        const configPath = path.resolve(options.config);
        
        if (!fs.existsSync(configPath)) {
          logger.error(`错误: 找不到配置文件 ${configPath}`);
          process.exit(1);
        }
        
        const sourceConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (!Array.isArray(sourceConfigs)) {
          logger.error('错误: 配置文件必须包含文档源数组');
          process.exit(1);
        }
        
        logger.info(`开始流式处理 ${sourceConfigs.length} 个文档源`);
        const result = await processDocumentSources(sourceConfigs, {
          batchSize: batchSize,
          processingInterval: interval,
          maxConcurrent: 1
        });
        
        logger.info('文档处理完成!');
        logger.info(`总文档源: ${result.total}`);
        logger.info(`成功处理: ${result.successful}`);
        logger.info(`处理失败: ${result.failed}`);
        logger.info(`总文档块: ${result.totalChunks}`);
        logger.info(`成功存储: ${result.storedChunks}`);
      }
    } catch (error) {
      logger.error('处理出错:', error);
      process.exit(1);
    }
  });

// 添加一个内存检查命令
program
  .command('check-memory')
  .description('检查并监控系统内存使用情况')
  .option('-t, --time <seconds>', '监控持续时间（秒）', '60')
  .option('-i, --interval <ms>', '检查间隔（毫秒）', '5000')
  .action(async (options) => {
    const memoryManager = MemoryManager.getInstance();
    
    logger.info('开始内存监控...');
    const duration = parseInt(options.time, 10) * 1000;
    const interval = parseInt(options.interval, 10);
    const startTime = Date.now();
    
    // 打印初始内存使用
    memoryManager.checkMemory('初始');
    
    // 设置定时器定期检查内存
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      memoryManager.checkMemory(`运行 ${elapsed}s`);
    }, interval);
    
    // 设置超时以停止监控
    setTimeout(() => {
      clearInterval(timer);
      memoryManager.checkMemory('最终');
      memoryManager.printReport();
      logger.info('内存监控完成');
    }, duration);
  });

// 更新test-github命令，添加内存配置选项
program
  .command('test-github')
  .description('测试GitHub仓库的流式处理')
  .requiredOption('-u, --url <url>', 'GitHub仓库URL')
  .option('-b, --batch-size <size>', '批次大小', '5')
  .option('-i, --interval <ms>', '处理间隔（毫秒）', '1000')
  .option('-m, --max-memory <mb>', 'Node.js最大内存（MB）', '4096')
  .option('-d, --max-depth <depth>', '最大目录深度', '3')
  .option('-f, --only-dirs <dirs>', '只处理指定目录（逗号分隔）')
  .option('-c, --chunk-size <size>', '文档块批次大小', '20')
  .option('--limit-files', '限制处理的文件数量')
  .option('--skip-code', '跳过代码文件处理')
  .action(async (options) => {
    const memoryManager = MemoryManager.getInstance();
    logger.info('开始测试GitHub仓库的流式处理...');
    
    // 输出配置信息
    logger.info(`配置:
      仓库URL: ${options.url}
      批次大小: ${options.batchSize}
      处理间隔: ${options.interval}ms
      最大内存: ${options.maxMemory}MB
      最大深度: ${options.maxDepth}
      目录过滤: ${options.onlyDirs || '无'}
      文档块批次大小: ${options.chunkSize}
      限制文件: ${options.limitFiles ? '是' : '否'}
      跳过代码: ${options.skipCode ? '是' : '否'}
    `);
    
    // 设置环境变量
    process.env.GITHUB_MAX_DEPTH = options.maxDepth;
    process.env.GITHUB_CHUNK_BATCH_SIZE = options.chunkSize;
    process.env.GITHUB_LIMIT_FILES = options.limitFiles ? 'true' : 'false';
    process.env.GITHUB_SKIP_CODE = options.skipCode ? 'true' : 'false';
    if (options.onlyDirs) {
      process.env.GITHUB_ONLY_DIRS = options.onlyDirs;
    }
    
    // 记录初始内存使用
    memoryManager.checkMemory('开始测试前');
    
    try {
      // 创建一个简单的文档处理器
      const processor = new DocumentProcessor({
        batchSize: parseInt(options.batchSize),
        processingInterval: parseInt(options.interval)
      });
      
      // 尝试垃圾回收
      memoryManager.tryGC(true);
      
      // 初始化处理器
      await processor.initialize();
      
      // 启动GitHub源处理
      const result = await processor.streamProcessDocumentSource({
        type: 'github',
        source: {
          url: options.url,
          name: `GitHub: ${options.url}`
        }
      });
      
      if (result.success) {
        logger.info('GitHub测试成功完成');
        logger.info(`处理文档块总数: ${result.stats?.totalChunks || 0}`);
        logger.info(`存储文档块总数: ${result.stats?.storedChunks || 0}`);
        logger.info(`处理耗时: ${result.stats?.timeMs || 0}ms`);
      } else {
        logger.error(`GitHub测试处理失败: ${result.message}`);
      }
      
      // 最终内存使用
      memoryManager.checkMemory('测试完成后');
      memoryManager.printReport();
    } catch (error) {
      logger.error('GitHub测试失败:', error);
      memoryManager.checkMemory('测试失败后');
      memoryManager.printReport();
    } finally {
      // 尝试手动垃圾回收
      memoryManager.tryGC(true);
    }
  });

// 更新clear-vectors命令，添加内存管理
program
  .command('clear-vectors')
  .description('清空向量数据库')
  .requiredOption('--confirm', '确认删除所有向量数据')
  .action(async (options) => {
    const memoryManager = MemoryManager.getInstance();
    logger.info('开始清空向量数据库...');
    
    try {
      // 初始化向量存储
      const vectorStore = new MastraVectorStore({
        apiKey: OPENAI_API_KEY,
        pgConnectionString: PG_CONNECTION_STRING,
        tablePrefix: PG_VECTOR_TABLE
      });
      
      await vectorStore.initialize();
      
      // 清空向量存储
      logger.info('正在清空向量数据...');
      const result = await vectorStore.deleteDocuments(['*']);
      
      if (result > 0) {
        logger.info(`成功清空向量数据库，删除了${result}条记录`);
      } else {
        logger.error(`清空向量数据库失败，可能没有记录可删除`);
      }
      
      // 关闭连接
      await vectorStore.close();
      
      // 最终内存使用
      memoryManager.checkMemory('操作完成后');
      memoryManager.printReport();
    } catch (error) {
      logger.error('清空向量数据库时出错:', error);
    }
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供任何命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 