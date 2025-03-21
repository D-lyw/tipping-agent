import { Request, Response } from 'express';
import { nostrEcosystemMonitor } from '../lib/nostrEcosystemMonitor';

/**
 * 健康检查端点处理器
 * 用于 Render 和其他平台监控服务健康状态
 */
export const healthCheck = (req: Request, res: Response) => {
  try {
    // 检查 Nostr 服务状态
    const isNostrRunning = nostrEcosystemMonitor.getMonitoringStatus();
    
    // 获取系统运行时间
    const uptime = process.uptime();
    const formattedUptime = formatUptime(uptime);
    
    // 获取内存使用情况
    const memoryUsage = process.memoryUsage();
    
    // 返回健康状态信息
    res.status(200).json({
      status: 'ok',
      services: {
        nostr: {
          status: isNostrRunning ? 'running' : 'stopped',
          message: isNostrRunning ? 'Nostr 监控服务正在运行' : 'Nostr 监控服务未运行'
        }
      },
      system: {
        uptime: formattedUptime,
        uptimeSeconds: uptime,
        memory: {
          rss: formatBytes(memoryUsage.rss),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapUsed: formatBytes(memoryUsage.heapUsed),
          external: formatBytes(memoryUsage.external)
        },
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // 在健康检查出现问题时，返回错误状态
    res.status(500).json({
      status: 'error',
      message: '健康检查失败',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * 格式化运行时间为人类可读格式
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  const parts = [];
  
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}秒`);
  
  return parts.join(' ');
}

/**
 * 格式化字节数为人类可读格式
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
} 