/**
 * 内存管理工具，用于监控和优化内存使用
 */

import { createLogger } from '../documents/utils/logger';

// 创建内存管理专用的日志实例
const logger = createLogger('MemoryManager');

export class MemoryManager {
  private static instance: MemoryManager;
  private startMemory: NodeJS.MemoryUsage;
  private totalFreed: number = 0;
  private gcCount: number = 0;
  private lastGcTime: number = 0;

  private constructor() {
    this.startMemory = process.memoryUsage();
    logger.info(`初始内存使用: ${this.formatMemory(this.startMemory.heapUsed)}`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * 尝试执行垃圾回收
   * @param force 是否强制执行垃圾回收，忽略最小间隔
   * @returns 是否成功执行垃圾回收
   */
  public tryGC(force: boolean = false): boolean {
    // 确保两次GC之间至少间隔5秒（除非强制执行）
    const now = Date.now();
    if (!force && (now - this.lastGcTime) < 5000) {
      return false;
    }

    try {
      const before = process.memoryUsage().heapUsed;
      
      // 尝试手动触发垃圾回收
      if (global.gc) {
        global.gc();
        this.gcCount++;
        
        // 计算释放的内存
        const after = process.memoryUsage().heapUsed;
        const freed = Math.max(0, before - after);
        this.totalFreed += freed;
        
        this.lastGcTime = now;
        
        logger.info(`垃圾回收 #${this.gcCount}: 释放 ${this.formatMemory(freed)}, 当前使用: ${this.formatMemory(after)}`);
        return true;
      } else {
        logger.warn('垃圾回收不可用，请使用 --expose-gc 参数启动Node');
        return false;
      }
    } catch (error) {
      logger.error(`垃圾回收失败: ${error}`);
      return false;
    }
  }

  /**
   * 检查当前内存使用并记录
   * @param label 日志标签
   */
  public checkMemory(label: string = '当前'): NodeJS.MemoryUsage {
    const memUsage = process.memoryUsage();
    logger.info(`${label}内存使用: ${this.formatMemory(memUsage.heapUsed)} (RSS: ${this.formatMemory(memUsage.rss)})`);
    return memUsage;
  }

  /**
   * 获取内存使用统计
   */
  public getStats() {
    const current = process.memoryUsage();
    return {
      initialHeap: this.startMemory.heapUsed,
      currentHeap: current.heapUsed,
      difference: current.heapUsed - this.startMemory.heapUsed,
      totalFreed: this.totalFreed,
      gcCount: this.gcCount,
      rss: current.rss,
      external: current.external
    };
  }

  /**
   * 打印内存使用报告
   */
  public printReport() {
    const stats = this.getStats();
    const current = process.memoryUsage();
    
    logger.info('======= 内存使用报告 =======');
    logger.info(`初始堆内存: ${this.formatMemory(stats.initialHeap)}`);
    logger.info(`当前堆内存: ${this.formatMemory(stats.currentHeap)}`);
    logger.info(`内存变化: ${this.formatMemory(stats.difference)}`);
    logger.info(`垃圾回收次数: ${stats.gcCount}`);
    logger.info(`垃圾回收释放内存: ${this.formatMemory(stats.totalFreed)}`);
    logger.info(`进程总内存 (RSS): ${this.formatMemory(current.rss)}`);
    logger.info('===========================');
  }

  /**
   * 格式化内存大小
   * @param bytes 字节数
   * @returns 格式化后的字符串
   */
  private formatMemory(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// 声明全局gc变量
declare global {
  // 使用Node.js内置类型
  var gc: undefined | GCFunction;
} 