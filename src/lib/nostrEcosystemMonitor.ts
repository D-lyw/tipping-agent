import { nostrContentFetcher, NostrContent } from './nostrContentFetcher';
import { nostrRewardTool } from '../tools/nostrRewardTool';
import { nostrClient } from './nostrMonitor';
import dotenv from 'dotenv';
import { mastra } from '../mastra';

// 加载环境变量
dotenv.config();

// 保存高质量内容的内存缓存
const highQualityContentCache = new Map<string, NostrContent>();
// 最大缓存大小
const maxHighQualityContentCacheSize = 100;

/**
 * Nostr 生态监控工作流
 */
export class NostrEcosystemMonitor {
  private nostrContentTappingWorkflow: any;
  private isMonitoring: boolean = false;

  constructor() {
    // 初始化 Nostr 内容打赏工作流
    this.nostrContentTappingWorkflow = mastra.getWorkflow('nostrContentTappingWorkflow');
  }

  /**
   * 初始化 Nostr 监控服务
   */
  public async initNostrClient(): Promise<void> {
    try {
      console.log('初始化 Nostr 监控服务...');

      // 从环境变量获取 Nostr 私钥
      const privateKey = process.env.NOSTR_PRIVATE_KEY;

      if (!privateKey) {
        console.warn('未设置 NOSTR_PRIVATE_KEY，将无法发布内容到 Nostr');
      }

      // 初始化 nostrClient
      // nostrClient 是从 nostrMonitor 模块中导入的单例，无需再次初始化
      // 只需要确保添加中继服务器

      // 获取中继服务器列表
      const relaysStr = process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.nostr.info';
      const relays = relaysStr.split(',').map(relay => relay.trim());

      // 添加中继服务器
      for (const relay of relays) {
        nostrClient.addRelay(relay);
      }

      // 初始化内容检索器
      nostrContentFetcher.init(relays);

      // 监听新内容事件
      nostrContentFetcher.on('new_content', this.handleNewContent.bind(this));

      console.log('Nostr 监控服务初始化完成');
    } catch (error) {
      console.error('初始化 Nostr 监控服务失败:', error);
      throw error;
    }
  }

  /**
   * 处理新的 Nostr 内容
   * @param content Nostr 内容
   */
  private async handleNewContent(content: NostrContent): Promise<void> {
    try {
      console.log(`收到新的 Nostr 内容: ${content.pubkey}: ${content.content}`);
      // 执行工作流
      const { start } = this.nostrContentTappingWorkflow.createRun();
      await start({
        triggerData: {
          id: content.id,
          pubkey: content.pubkey,
          content: content.content,
        },
      });
    } catch (error) {
      console.error('处理新 Nostr 内容时出错:', error);
    }
  }

  /**
   * 启动实时监控服务
   */
  public startRealtimeMonitoring(): void {
    try {
      if (this.isMonitoring) {
        console.log('Nostr 实时监控已经在运行中');
        return;
      }

      console.log('启动 Nostr 实时监控...');
      nostrContentFetcher.startMonitoring();
      this.isMonitoring = true;
      console.log('Nostr 实时监控已启动');
    } catch (error) {
      console.error('启动 Nostr 实时监控失败:', error);
      this.isMonitoring = false;
    }
  }

  /**
   * 停止实时监控服务
   */
  public stopRealtimeMonitoring(): void {
    try {
      if (!this.isMonitoring) {
        console.log('Nostr 实时监控未运行');
        return;
      }

      console.log('停止 Nostr 实时监控...');
      nostrContentFetcher.stopMonitoring();
      this.isMonitoring = false;
      console.log('Nostr 实时监控已停止');
    } catch (error) {
      console.error('停止 Nostr 实时监控失败:', error);
    }
  }

  /**
   * 执行历史内容搜索
   * @param hoursBack 搜索过去多少小时的内容
   */
  public async fetchHistoricalContent(hoursBack: number = 24): Promise<void> {
    try {
      console.log(`搜索过去 ${hoursBack} 小时的 Nostr 内容...`);

      // 计算起始时间戳（秒）
      const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;

      // 获取历史内容
      const contents = await nostrContentFetcher.fetchRecentContent(since);

      console.log(`获取到 ${contents.length} 条历史内容，开始评估...`);

      // 评估每个内容
      for (const content of contents) {
        await this.handleNewContent(content);
      }

      console.log('历史内容评估完成');
    } catch (error) {
      console.error('搜索历史内容失败:', error);
    }
  }

  /**
   * 运行完整的生态监控流程
   */
  public async runFullMonitoringProcess(): Promise<void> {
    try {
      console.log('运行 Nostr 生态监控完整流程...');

      // 1. 初始化 Nostr 监控
      await this.initNostrClient();

      // 2. 搜索历史内容（过去 24 小时）
      await this.fetchHistoricalContent(24);

      // 3. 启动实时监控
      this.startRealtimeMonitoring();

      console.log('Nostr 生态监控完整流程已启动');
    } catch (error) {
      console.error('运行 Nostr 生态监控流程失败:', error);
    }
  }

  /**
   * 停止所有监控服务
   */
  public stopAllMonitoring(): void {
    // 停止实时监控
    this.stopRealtimeMonitoring();
    console.log('所有 Nostr 监控服务已停止');
  }

  /**
   * 检查 Nostr 监控服务是否正在运行
   * @returns 是否正在监控
   */
  public isMonitoring(): boolean {
    return this.isMonitoring;
  }
}

// 导出全局单例
export const nostrEcosystemMonitor = new NostrEcosystemMonitor();

// 导出触发方法
export const nostrEcosystemMonitorTrigger = {
  /**
   * 立即运行监控流程
   */
  runNow: async () => {
    await nostrEcosystemMonitor.runFullMonitoringProcess();
  },

  /**
   * 启动实时监控
   */
  startRealtime: () => {
    nostrEcosystemMonitor.startRealtimeMonitoring();
  },

  /**
   * 停止实时监控
   */
  stopRealtime: () => {
    nostrEcosystemMonitor.stopRealtimeMonitoring();
  },

  /**
   * 搜索历史内容
   * @param hours 搜索过去多少小时的内容
   */
  fetchHistorical: async (hours = 24) => {
    await nostrEcosystemMonitor.fetchHistoricalContent(hours);
  },

  /**
   * 停止所有监控服务
   */
  stopAll: () => {
    nostrEcosystemMonitor.stopAllMonitoring();
  }
}; 