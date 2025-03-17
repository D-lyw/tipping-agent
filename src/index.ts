import { mastra } from './mastra';
import { replyMonitor, ReplyMonitor } from './lib/replyMonitor';
import dotenv from 'dotenv';
import { ckbEcosystemMonitor } from './workflows/ckbEcosystemMonitor';

// 加载环境变量
dotenv.config();

// 启动应用
async function startApp() {
  console.log('启动 Tapping Agent 应用...');
  
  // 设置未捕获异常处理
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
  });
  
  // 启动回复监控服务
  try {
    console.log('启动推文回复监控服务...');
    
    // 设置监控间隔（默认为 60 秒）
    const monitorInterval = parseInt(process.env.MONITOR_INTERVAL || '60000', 10);
    
    // 创建新的监控实例，而不是调用 constructor
    const monitor = new ReplyMonitor(monitorInterval);
    
    // 启动监控
    monitor.start();
    console.log(`回复监控服务已启动，检查间隔: ${monitorInterval}ms`);
    
    // 如果有预设的需要监控的推文，可以在这里添加
    const monitoredTweets = process.env.MONITORED_TWEETS;
    if (monitoredTweets) {
      const tweets = monitoredTweets.split(',');
      const userId = process.env.TWITTER_USER_ID || '';
      
      if (userId) {
        for (const tweetId of tweets) {
          monitor.addTweetToMonitor(tweetId.trim(), userId);
          console.log(`添加预设监控推文: ${tweetId}`);
        }
      } else {
        console.warn('未设置 TWITTER_USER_ID 环境变量，无法添加预设监控推文');
      }
    }
  } catch (error) {
    console.error('启动回复监控服务失败:', error);
  }
  
  // 启动 CKB 生态监控工作流
  try {
    console.log('启动 CKB 生态监控工作流...');
    
    // 启动定时任务
    await ckbEcosystemMonitor.trigger('scheduledTrigger');
    console.log('CKB 生态监控工作流已启动，将按计划执行');
    
    // 如果设置了立即执行标志，立即运行一次
    if (process.env.RUN_ECOSYSTEM_MONITOR_IMMEDIATELY === 'true') {
      console.log('立即执行 CKB 生态监控...');
      await ckbEcosystemMonitor.trigger('manualTrigger');
    }
  } catch (error) {
    console.error('启动 CKB 生态监控工作流失败:', error);
  }
  
  console.log('Tapping Agent 应用已启动');
}

// 启动应用
startApp().catch((error) => {
  console.error('启动应用失败:', error);
  process.exit(1);
}); 