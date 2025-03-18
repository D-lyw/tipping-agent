import { nostrEcosystemMonitor } from './lib/nostrEcosystemMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 设置未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

/**
 * 启动 Nostr 监控系统
 */
async function startNostrMonitoring() {
  console.log('启动 Nostr 监控系统...');
  
  try {
    // 1. 初始化 tappingAgent（启动 mastra framework）
    
    // 2. 启动完整的 Nostr 生态监控流程
    await nostrEcosystemMonitor.runFullMonitoringProcess();
    
    console.log('Nostr 监控系统启动成功！');
    console.log('按 Ctrl+C 停止运行');
  } catch (error) {
    console.error('启动 Nostr 监控系统失败:', error);
    process.exit(1);
  }
}

// 检查是否通过参数指定了操作
const args = process.argv.slice(2);
if (args.length > 0) {
  switch (args[0]) {
    case 'historical':
      // 搜索历史内容
      const hours = args[1] ? parseInt(args[1], 10) : 24;
      console.log(`执行历史内容搜索，范围: ${hours} 小时...`);
      nostrEcosystemMonitor.initNostrMonitor()
        .then(() => nostrEcosystemMonitor.fetchHistoricalContent(hours))
        .then(() => {
          console.log('历史内容搜索完成，退出程序');
          process.exit(0);
        })
        .catch(error => {
          console.error('历史内容搜索失败:', error);
          process.exit(1);
        });
      break;
      
    case 'realtime':
      // 只启动实时监控
      console.log('启动实时监控...');
      nostrEcosystemMonitor.initNostrMonitor()
        .then(() => nostrEcosystemMonitor.startRealtimeMonitoring())
        .then(() => {
          console.log('实时监控已启动，按 Ctrl+C 停止');
        })
        .catch(error => {
          console.error('启动实时监控失败:', error);
          process.exit(1);
        });
      break;
      
    default:
      // 默认启动完整流程
      startNostrMonitoring();
  }
} else {
  // 默认启动完整流程
  startNostrMonitoring();
}

// 处理退出信号
process.on('SIGINT', () => {
  console.log('接收到退出信号，正在停止 Nostr 监控系统...');
  nostrEcosystemMonitor.stopAllMonitoring();
  console.log('Nostr 监控系统已停止');
  process.exit(0);
}); 