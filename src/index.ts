/**
 * 主入口文件
 * 
 * 用于启动所有服务，包括：
 * 1. CKB 文档问答 Discord Bot
 * 2. Nostr 监控服务
 * 3. Express Web 服务器（用于健康检查和 API）
 */

import { CkbDiscordBot } from './lib/discordBot';
import { createDocumentManager } from './documents';
import { nostrEcosystemMonitor } from './lib/nostrEcosystemMonitor';
import dotenv from 'dotenv';
import express from 'express';
import routes from './routes';

// 加载环境变量
dotenv.config();

// 判断是否启用各个服务
const enableCkbBot = process.env.ENABLE_CKB_BOT !== 'false'; // 默认启用
const enableNostr = process.env.ENABLE_NOSTR !== 'false';    // 默认启用
const webPort = process.env.PORT || 3000;                    // Web 服务器端口

// 必要的环境变量检查
const checkRequiredEnvVars = () => {
  if (enableCkbBot) {
    const ckbBotRequiredVars = ['DISCORD_BOT_TOKEN', 'OPENAI_API_KEY'];
    const missingCkbBotVars = ckbBotRequiredVars.filter(varName => !process.env[varName]);

    if (missingCkbBotVars.length > 0) {
      console.warn(`警告：CKB Discord Bot 服务缺少以下环境变量：${missingCkbBotVars.join(', ')}`);
      console.warn('CKB Discord Bot 服务将不会启动');
      return false;
    }
  }

  if (enableNostr) {
    const nostrRequiredVars = ['NOSTR_PRIVATE_KEY'];
    const missingNostrVars = nostrRequiredVars.filter(varName => !process.env[varName]);

    if (missingNostrVars.length > 0) {
      console.warn(`警告：Nostr 监控服务缺少以下环境变量：${missingNostrVars.join(', ')}`);
      console.warn('Nostr 监控服务将不会启动');
      return false;
    }
  }

  return true;
};

// 启动 Express 服务器
async function startExpressServer() {
  try {
    console.log('正在启动 Web 服务器...');

    const app = express();

    // 中间件
    app.use(express.json());

    // 路由
    app.use('/', routes);

    // 根路由
    app.get('/', (req: express.Request, res: express.Response) => {
      res.json({
        message: 'Tapping Agent API',
        version: '1.0.0',
        endpoints: [
          { path: '/health', description: '健康检查端点' }
        ]
      });
    });

    // 返回 Express 应用（不启动服务器，由调用者启动）
    return app;
  } catch (error) {
    console.error('创建 Web 服务器失败:', error);
    return null;
  }
}

// 启动 CKB Discord Bot
async function startCkbBot() {
  try {
    console.log('正在启动 CKB 文档问答 Discord Bot...');

    // 获取允许的频道列表（如果有）
    const allowedChannels = process.env.ALLOWED_CHANNEL_IDS === '*' 
      ? []  // 如果配置为 * 则表示监听所有频道
      : process.env.ALLOWED_CHANNEL_IDS
        ? process.env.ALLOWED_CHANNEL_IDS.split(',')
        : [];

    // 检查命令行参数
    const args = process.argv.slice(2);
    const forceRefreshDocs = args.includes('--refresh') || process.env.FORCE_REFRESH_DOCS === 'true';

    // 初始化文档管理器
    const docManager = createDocumentManager({ forceRefreshDocs: forceRefreshDocs });
    await docManager.initialize();

    // 如果需要，强制刷新文档源数据
    if (forceRefreshDocs) {
      console.log('强制刷新文档缓存...');
      // 先清空缓存
      await docManager.clearCache();
      // 然后重新获取所有文档
      await docManager.fetchAllSources();
      console.log('文档缓存已刷新');
    }

    // 创建 Discord Bot 实例
    const discordBot = new CkbDiscordBot({
      token: process.env.DISCORD_BOT_TOKEN!,
      prefix: process.env.BOT_PREFIX || '!ckb',
      channelIds: allowedChannels.length > 0 ? allowedChannels : undefined,
    });

    // 启动 Bot
    await discordBot.start();

    console.log('CKB 文档问答 Discord Bot 已成功启动！');
    console.log(`命令前缀: ${process.env.BOT_PREFIX || '!ckb'}`);
    if (allowedChannels.length > 0) {
      console.log(`允许的频道 ID: ${allowedChannels.join(', ')}`);
    } else {
      console.log('Bot 将响应所有可访问的频道');
    }

    // 返回 bot 实例，以便后续可能的清理工作
    return discordBot;
  } catch (error) {
    console.error('启动 CKB 文档问答 Discord Bot 失败:', error);
    return null;
  }
}

// 启动 Nostr 监控服务
async function startNostrMonitor() {
  try {
    console.log('正在启动 Nostr 监控服务...');

    // 启动完整的 Nostr 生态监控流程
    await nostrEcosystemMonitor.runFullMonitoringProcess();

    console.log('Nostr 监控服务已成功启动！');
    return true;
  } catch (error) {
    console.error('启动 Nostr 监控服务失败:', error);
    return false;
  }
}

// 主函数 - 启动所有服务
export async function startAllServices() {
  console.log('正在启动所有服务...');

  checkRequiredEnvVars();

  let ckbBotStarted = false;
  let nostrStarted = false;
  let webServerStarted = false;
  let discordBot = null;
  let server: any = null;

  // 启动 Express 服务器
  const expressApp = await startExpressServer();
  if (expressApp) {
    // 启动 HTTP 服务器
    server = expressApp.listen(webPort, () => {
      console.log(`Web 服务器已启动，监听端口: ${webPort}`);
    });
    webServerStarted = true;
  }

  // 启动 CKB Discord Bot
  if (enableCkbBot) {
    discordBot = await startCkbBot();
    ckbBotStarted = !!discordBot;
  } else {
    console.log('CKB 文档问答 Discord Bot 已禁用，跳过启动');
  }

  // 启动 Nostr 监控服务
  if (enableNostr) {
    nostrStarted = await startNostrMonitor();
  } else {
    console.log('Nostr 监控服务已禁用，跳过启动');
  }

  // 显示启动状态摘要
  console.log('\n==== 服务启动状态摘要 ====');
  console.log(`Web 服务器: ${webServerStarted ? '✅ 已启动' : '❌ 未启动'}`);
  console.log(`CKB 文档问答 Discord Bot: ${ckbBotStarted ? '✅ 已启动' : '❌ 未启动'}`);
  console.log(`Nostr 监控服务: ${nostrStarted ? '✅ 已启动' : '❌ 未启动'}`);
  console.log('==========================\n');

  // 如果没有成功启动任何服务，退出程序
  if (!ckbBotStarted && !nostrStarted && !webServerStarted) {
    console.error('没有成功启动任何服务，程序将退出');
    throw new Error('没有成功启动任何服务');
  }

  // 设置优雅退出
  setupGracefulShutdown(discordBot, server);

  console.log('所有启用的服务已成功启动！');
  console.log('按 Ctrl+C 停止所有服务');

  return { ckbBotStarted, nostrStarted, webServerStarted, discordBot, expressApp, server };
}

// 优雅退出
function setupGracefulShutdown(discordBot: any, server: any) {
  // 未捕获的异常处理
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
  });

  // 处理退出信号
  process.on('SIGINT', async () => {
    console.log('\n接收到中断信号，正在关闭所有服务...');

    // 停止 Discord Bot
    if (discordBot) {
      await discordBot.stop();
    }

    // 停止 Nostr 监控
    if (enableNostr) {
      nostrEcosystemMonitor.stopAllMonitoring();
    }

    // 停止 Express 服务器
    if (server) {
      server.close(() => {
        console.log('Express 服务器已关闭');
      });
    }

    console.log('所有服务已关闭，程序退出');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n接收到终止信号，正在关闭所有服务...');

    // 停止 Discord Bot
    if (discordBot) {
      await discordBot.stop();
    }

    // 停止 Nostr 监控
    if (enableNostr) {
      nostrEcosystemMonitor.stopAllMonitoring();
    }

    // 停止 Express 服务器
    if (server) {
      server.close(() => {
        console.log('Express 服务器已关闭');
      });
    }

    console.log('所有服务已关闭，程序退出');
    process.exit(0);
  });
}

// 只有在直接运行此文件时才启动服务
// ESM 环境中检查是否直接运行此文件
import { fileURLToPath } from 'url';
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  // 启动应用
  startAllServices().catch(error => {
    console.error('启动过程中出现未捕获的错误:', error);
    process.exit(1);
  });
}

/**
 * tapping-agent 主入口文件
 *
 * 导出所有模块的公共API
 */

// 其他模块的导出将在以后添加 