import { createXClient } from './x';
import { tappingAgent } from '../mastra/agents';
import { EventEmitter } from 'events';
import { TwitterApi } from 'twitter-api-v2';
import * as dotenv from 'dotenv';

dotenv.config();

// 从环境变量获取 Twitter API 凭证
const apiKey = process.env.TWITTER_API_KEY || '';
const apiSecret = process.env.TWITTER_API_SECRET || '';
const accessToken = process.env.TWITTER_ACCESS_TOKEN || '';
const accessSecret = process.env.TWITTER_ACCESS_SECRET || '';

// 创建 X 客户端实例
const xClient = createXClient(apiKey, apiSecret, accessToken, accessSecret);

// 创建事件发射器
export const replyEventEmitter = new EventEmitter();

// 存储已处理的回复 ID，避免重复处理
const processedReplies = new Set<string>();

// 定义事件类型
export interface ReplyMonitorEvents {
  'new-reply': (reply: any) => void;
  'error': (error: Error) => void;
}

/**
 * 监控推文回复
 */
export class ReplyMonitor extends EventEmitter {
  private client: TwitterApi;
  private monitorInterval: number;
  private monitoredTweets: Map<string, string> = new Map();
  private isRunning: boolean = false;
  private lastCheckTime: number = 0;
  private minIntervalBetweenChecks: number = 60000; // 最小检查间隔（60秒）
  private maxRetries: number = 3; // 最大重试次数
  private retryDelay: number = 5000; // 重试延迟（5秒）

  /**
   * 构造函数
   * @param monitorInterval 监控间隔时间（毫秒），默认为 60 秒
   */
  constructor(monitorInterval: number = 60000) {
    super();
    this.monitorInterval = Math.max(monitorInterval, this.minIntervalBetweenChecks);
    this.client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY || '',
      appSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
    });
  }

  /**
   * 添加要监控的推文
   * @param tweetId 推文 ID
   * @param ownerUserId 发推文的用户 ID（用于识别非自己的回复）
   */
  addTweetToMonitor(tweetId: string, ownerUserId: string) {
    this.monitoredTweets.set(tweetId, ownerUserId);
    console.log(`开始监控推文 ${tweetId}`);
  }

  /**
   * 移除监控的推文
   * @param tweetId 推文 ID
   */
  removeTweetFromMonitor(tweetId: string) {
    this.monitoredTweets.delete(tweetId);
    console.log(`停止监控推文 ${tweetId}`);
  }

  /**
   * 开始监控
   */
  start() {
    if (this.isRunning) {
      console.log('监控已经在运行中');
      return;
    }

    this.isRunning = true;
    this.monitorLoop();
    console.log(`回复监控已启动，检查间隔: ${this.monitorInterval}ms`);
  }

  /**
   * 停止监控
   */
  stop() {
    this.isRunning = false;
    console.log('回复监控已停止');
  }

  private async checkRepliesWithRetry(tweetId: string, userId: string, retryCount: number = 0): Promise<void> {
    try {
      const now = Date.now();
      const timeSinceLastCheck = now - this.lastCheckTime;

      // 确保遵守最小检查间隔
      if (timeSinceLastCheck < this.minIntervalBetweenChecks) {
        await new Promise(resolve => 
          setTimeout(resolve, this.minIntervalBetweenChecks - timeSinceLastCheck)
        );
      }

      const replies = await this.client.v2.search(`conversation_id:${tweetId}`, {
        'tweet.fields': ['author_id', 'created_at', 'text'],
        max_results: 100,
      });

      this.lastCheckTime = Date.now();

      // 处理回复
      for (const reply of replies.data.data || []) {
        if (reply.author_id !== userId) {
          this.emit('new-reply', reply);
        }
      }
    } catch (error) {
      console.error(`检查回复失败 (尝试 ${retryCount + 1}/${this.maxRetries}):`, error);
      
      if (retryCount < this.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        await this.checkRepliesWithRetry(tweetId, userId, retryCount + 1);
      } else {
        this.emit('error', error as Error);
      }
    }
  }

  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      for (const [tweetId, userId] of this.monitoredTweets) {
        await this.checkRepliesWithRetry(tweetId, userId);
      }
      await new Promise(resolve => setTimeout(resolve, this.monitorInterval));
    }
  }

  /**
   * 手动检查特定推文的回复
   * @param tweetId 推文 ID
   * @returns 回复列表
   */
  async checkTweetRepliesManually(tweetId: string) {
    try {
      return await xClient.getTweetReplies(tweetId);
    } catch (error) {
      console.error(`手动检查推文 ${tweetId} 的回复时出错:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// 创建全局实例
export const replyMonitor = new ReplyMonitor();

// 监听新回复事件，处理打赏逻辑
replyEventEmitter.on('new-reply', async (replyData) => {
  console.log(`收到新回复: ${replyData.text} (来自 @${replyData.author_id})`);
  
  // 检查回复中是否包含 CKB 地址
  const ckbAddressRegex = /ck[a-z0-9]{42,}/i;
  const match = replyData.text.match(ckbAddressRegex);
  
  if (match) {
    const ckbAddress = match[0];
    console.log(`检测到 CKB 地址: ${ckbAddress}`);
    
    // 使用打赏 Agent 处理打赏
    try {
      const response = await tappingAgent.generate([
        {
          role: 'system',
          content: `用户 @${replyData.author_id} 回复了你的评论，并提供了 CKB 地址: ${ckbAddress}。请根据内容价值进行打赏。`
        },
        {
          role: 'user',
          content: `原始推文ID: ${replyData.conversation_id}\n回复内容: ${replyData.text}\n检测到的 CKB 地址: ${ckbAddress}`
        }
      ]);
      
      console.log(`打赏 Agent 响应: ${response.text}`);
    } catch (error) {
      console.error('调用打赏 Agent 时出错:', error);
    }
  } else {
    console.log('回复中未检测到 CKB 地址');
  }
});

// 导出全局实例
export default replyMonitor; 