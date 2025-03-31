import { getMemoryStats } from '../src/mastra/agents';

/**
 * Memory 监控脚本
 * 用于查看 Memory 使用情况并执行清理操作
 * 
 * 使用方法：
 * pnpm ts-node scripts/monitor-memory.ts [--cleanup]
 */

async function monitorMemory() {
  try {
    const stats = await getMemoryStats();
    console.log('Memory 统计信息:', {
      总线程数: stats.totalThreads,
      总消息数: stats.totalMessages,
      活跃线程数: stats.activeThreads,
      平均每线程消息数: stats.avgMessagesPerThread,
      最早消息时间: stats.oldestMessageDate,
      最新消息时间: stats.newestMessageDate
    });
  } catch (error) {
    console.error('监控失败:', error);
    process.exit(1);
  }
}

monitorMemory(); 