import { mastra } from './mastra';
import dotenv from 'dotenv';
import { nostrEcosystemMonitor } from './lib/nostrEcosystemMonitor';

// 加载环境变量
dotenv.config();

// 设置未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

// 启动应用
async function startApp() {
  console.log('启动 Tapping Agent 应用...');

  // 启动 Mastra 框架
  // mastra 实例没有 start 方法，跳过这一步

  // 启动 Nostr 生态内容监听服务
  await nostrEcosystemMonitor.runFullMonitoringProcess();

  console.log('Tapping Agent 应用已启动');
}

// 启动应用
startApp().catch((error) => {
  console.error('启动应用失败:', error);
  process.exit(1);
});

// 处理退出信号
process.on('SIGINT', () => {
  console.log('接收到退出信号，正在停止 Nostr 监控系统...');
  nostrEcosystemMonitor.stopAllMonitoring();
  console.log('Nostr 监控系统已停止');
  process.exit(0);
}); 