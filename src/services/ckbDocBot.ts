/**
 * CKB文档Discord Bot启动脚本
 */

import { CkbDiscordBot } from '../lib/discordBot';
// 从新模块导入
import { createDocumentManager } from '../documents';
// 导入Mastra实例，但我们目前不直接调用它的方法
import '../mastra';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
  try {
    console.log('CKB文档Discord Bot启动中...');
    
    // 检查环境变量
    const discordToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
    if (!discordToken) {
      console.error('错误: 缺少DISCORD_BOT_TOKEN环境变量');
      console.error('请在.env文件中设置您的Discord Bot令牌');
      process.exit(1);
    }
    
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('警告: 缺少OPENAI_API_KEY环境变量');
      console.error('请在.env文件中设置您的OpenAI API密钥以确保语言模型正常工作');
    }
    
    // 允许的Discord频道ID
    const allowedChannelStr = process.env.ALLOWED_CHANNEL_IDS || process.env.DISCORD_ALLOWED_CHANNELS;
    const allowedChannels = allowedChannelStr ? allowedChannelStr.split(',') : [];
    
    // 预加载文档数据
    console.log('预加载CKB文档数据...');
    const docManager = createDocumentManager();
    await docManager.initialize();
    await docManager.fetchAllSources();
    
    // 注意：通过导入，Mastra框架会自动初始化，不需要显式调用初始化方法
    console.log('Mastra框架已加载');
    
    // 创建并启动Discord Bot
    const bot = new CkbDiscordBot({
      token: discordToken,
      prefix: process.env.BOT_PREFIX || process.env.DISCORD_PREFIX || '!ckb',
      channelIds: allowedChannels.length > 0 ? allowedChannels : undefined
    });
    
    // 启动Bot
    await bot.start();
    
    // 处理进程退出
    process.on('SIGINT', async () => {
      console.log('\n正在关闭CKB文档Discord Bot...');
      await bot.stop();
      // Mastra不需要显式关闭
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n收到终止信号，正在关闭CKB文档Discord Bot...');
      await bot.stop();
      // Mastra不需要显式关闭
      process.exit(0);
    });
    
    console.log('CKB文档Discord Bot已成功启动！');
    console.log(`使用前缀 "${process.env.BOT_PREFIX || process.env.DISCORD_PREFIX || '!ckb'}" 来询问问题`);
    
    // 保持进程运行
    keepAlive();
  } catch (error) {
    console.error('启动CKB文档Discord Bot失败:', error);
    process.exit(1);
  }
}

// 保持进程运行
function keepAlive() {
  setInterval(() => {}, 60000);
}

// 运行主函数
main().catch(error => {
  console.error('运行时出错:', error);
  process.exit(1);
}); 