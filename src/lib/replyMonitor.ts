import { createXClient } from './x';
import { tappingAgent } from '../mastra/agents';
import { EventEmitter } from 'events';

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

/**
 * 监控推文回复
 */
export class ReplyMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval: number; // 检查间隔时间（毫秒）
  private monitoredTweets: Map<string, { lastChecked: Date, ownerUserId: string }> = new Map();

  /**
   * 构造函数
   * @param checkInterval 检查间隔时间（毫秒），默认为 60 秒
   */
  constructor(checkInterval: number = 60000) {
    this.checkInterval = checkInterval;
  }

  /**
   * 添加要监控的推文
   * @param tweetId 推文 ID
   * @param ownerUserId 发推文的用户 ID（用于识别非自己的回复）
   */
  addTweetToMonitor(tweetId: string, ownerUserId: string) {
    this.monitoredTweets.set(tweetId, {
      lastChecked: new Date(),
      ownerUserId
    });
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
    if (this.intervalId) {
      console.log('监控已经在运行中');
      return;
    }

    this.intervalId = setInterval(async () => {
      await this.checkReplies();
    }, this.checkInterval);

    console.log(`回复监控已启动，检查间隔: ${this.checkInterval}ms`);
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('回复监控已停止');
    }
  }

  /**
   * 检查所有监控的推文是否有新回复
   */
  private async checkReplies() {
    console.log(`检查 ${this.monitoredTweets.size} 条推文的回复...`);

    for (const [tweetId, { lastChecked, ownerUserId }] of this.monitoredTweets.entries()) {
      try {
        const result = await xClient.getTweetReplies(tweetId);
        
        if (!result.success || !result.data) {
          console.error(`获取推文 ${tweetId} 的回复失败:`, result.error);
          continue;
        }

        // 过滤出上次检查后的新回复，并且不是自己发的
        const newReplies = result.data.filter(reply => {
          // 检查是否已处理过
          if (processedReplies.has(reply.id)) {
            return false;
          }

          // 检查是否是自己的回复
          if (reply.author_id === ownerUserId) {
            return false;
          }

          // 标记为已处理
          processedReplies.add(reply.id);
          return true;
        });

        if (newReplies.length > 0) {
          console.log(`推文 ${tweetId} 有 ${newReplies.length} 条新回复`);
          
          // 为每条新回复触发事件
          for (const reply of newReplies) {
            // 查找用户信息
            const user = result.includes?.users?.find(u => u.id === reply.author_id);
            
            // 触发回复事件
            replyEventEmitter.emit('new-reply', {
              tweetId,
              replyId: reply.id,
              replyText: reply.text,
              userId: reply.author_id,
              username: user?.username || '未知用户',
              timestamp: reply.created_at
            });
          }
        }

        // 更新最后检查时间
        this.monitoredTweets.set(tweetId, {
          lastChecked: new Date(),
          ownerUserId
        });
      } catch (error) {
        console.error(`检查推文 ${tweetId} 的回复时出错:`, error);
      }
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
  console.log(`收到新回复: ${replyData.replyText} (来自 @${replyData.username})`);
  
  // 检查回复中是否包含 CKB 地址
  const ckbAddressRegex = /ck[a-z0-9]{42,}/i;
  const match = replyData.replyText.match(ckbAddressRegex);
  
  if (match) {
    const ckbAddress = match[0];
    console.log(`检测到 CKB 地址: ${ckbAddress}`);
    
    // 使用打赏 Agent 处理打赏
    try {
      const response = await tappingAgent.generate([
        {
          role: 'system',
          content: `用户 @${replyData.username} 回复了你的评论，并提供了 CKB 地址: ${ckbAddress}。请根据内容价值进行打赏。`
        },
        {
          role: 'user',
          content: `原始推文ID: ${replyData.tweetId}\n回复内容: ${replyData.replyText}\n检测到的 CKB 地址: ${ckbAddress}`
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