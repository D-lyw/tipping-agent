/**
 * 主入口文件
 * 
 * 用于启动所有服务，包括：
 * 1. CKB 文档问答 Discord Bot
 * 2. Nostr 监控服务
 */

import { CkbDiscordBot } from './lib/discordBot';
import { fetchAllDocuments } from './lib/ckbDocuments';
import { nostrEcosystemMonitor } from './lib/nostrEcosystemMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 判断是否启用各个服务
const enableCkbBot = process.env.ENABLE_CKB_BOT !== 'false'; // 默认启用
const enableNostr = process.env.ENABLE_NOSTR !== 'false';    // 默认启用

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

// 启动 CKB Discord Bot
async function startCkbBot() {
  try {
    console.log('正在启动 CKB 文档问答 Discord Bot...');
    
    // 获取允许的频道列表（如果有）
    const allowedChannels = process.env.ALLOWED_CHANNEL_IDS 
      ? process.env.ALLOWED_CHANNEL_IDS.split(',')
      : [];
      
    // 检查命令行参数
    const args = process.argv.slice(2);
    const forceRefreshDocs = args.includes('--refresh') || process.env.FORCE_REFRESH_DOCS === 'true';
    
    // 如果需要，强制刷新文档缓存
    if (forceRefreshDocs) {
      console.log('强制刷新文档缓存...');
      await fetchAllDocuments(true);
      console.log('文档缓存已刷新');
    }
    
    // 创建 Discord Bot 实例
    const discordBot = new CkbDiscordBot({
      token: process.env.DISCORD_BOT_TOKEN!,
      prefix: process.env.BOT_PREFIX || '!ckb',
      channelIds: allowedChannels.length > 0 ? allowedChannels : undefined,
      openaiApiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.MODEL_NAME,
      memorySize: process.env.MEMORY_SIZE ? parseInt(process.env.MEMORY_SIZE) : undefined
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
async function startAllServices() {
  console.log('正在启动所有服务...');
  
  checkRequiredEnvVars();
  
  let ckbBotStarted = false;
  let nostrStarted = false;
  let discordBot = null;
  
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
  console.log(`CKB 文档问答 Discord Bot: ${ckbBotStarted ? '✅ 已启动' : '❌ 未启动'}`);
  console.log(`Nostr 监控服务: ${nostrStarted ? '✅ 已启动' : '❌ 未启动'}`);
  console.log('==========================\n');
  
  // 如果没有成功启动任何服务，退出程序
  if (!ckbBotStarted && !nostrStarted) {
    console.error('没有成功启动任何服务，程序将退出');
    process.exit(1);
  }
  
  // 设置优雅退出
  setupGracefulShutdown(discordBot);
  
  console.log('所有启用的服务已成功启动！');
  console.log('按 Ctrl+C 停止所有服务');
}

// 优雅退出
function setupGracefulShutdown(discordBot: any) {
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
    
    console.log('所有服务已关闭，程序退出');
    process.exit(0);
  });
}

// 启动应用
startAllServices().catch(error => {
  console.error('启动过程中出现未捕获的错误:', error);
  process.exit(1);
}); 