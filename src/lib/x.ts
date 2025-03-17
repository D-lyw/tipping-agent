import { TwitterApi, TwitterApiReadWrite } from 'twitter-api-v2';

/**
 * Twitter/X API 客户端封装
 * 提供搜索、评论、发布推文等功能
 */
export class XClient {
  private client: TwitterApiReadWrite;

  /**
   * 构造函数
   * @param apiKey API 密钥
   * @param apiSecret API 密钥秘密
   * @param accessToken 访问令牌
   * @param accessSecret 访问令牌秘密
   */
  constructor(
    apiKey: string,
    apiSecret: string,
    accessToken: string,
    accessSecret: string
  ) {
    this.client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessSecret,
    }).readWrite;
  }

  /**
   * 搜索推文
   * @param query 搜索关键词
   * @param maxResults 最大结果数量
   * @returns 搜索结果
   */
  async searchTweets(query: string, maxResults: number = 10) {
    try {
      const result = await this.client.v2.search({
        query,
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
        expansions: ['author_id'],
        'user.fields': ['name', 'username', 'profile_image_url'],
      });

      return {
        success: true,
        data: result.data,
        includes: result.includes,
        meta: result.meta,
      };
    } catch (error) {
      console.error('搜索推文失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 发布推文
   * @param text 推文内容
   * @returns 发布结果
   */
  async postTweet(text: string) {
    try {
      const result = await this.client.v2.tweet(text);
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error('发布推文失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 回复推文
   * @param tweetId 要回复的推文ID
   * @param text 回复内容
   * @returns 回复结果
   */
  async replyToTweet(tweetId: string, text: string) {
    try {
      const result = await this.client.v2.reply(text, tweetId);
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error('回复推文失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取用户时间线
   * @param userId 用户ID
   * @param maxResults 最大结果数量
   * @returns 用户时间线
   */
  async getUserTimeline(userId: string, maxResults: number = 10) {
    try {
      const result = await this.client.v2.userTimeline(userId, {
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics'],
      });
      
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    } catch (error) {
      console.error('获取用户时间线失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 点赞推文
   * @param tweetId 推文ID
   * @returns 点赞结果
   */
  async likeTweet(tweetId: string) {
    try {
      const userId = await this.getUserId();
      const result = await this.client.v2.like(userId, tweetId);
      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error('点赞推文失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取推文的回复
   * @param tweetId 推文ID
   * @param maxResults 最大结果数量
   * @returns 回复列表
   */
  async getTweetReplies(tweetId: string, maxResults: number = 20) {
    try {
      // 使用搜索 API 查找对特定推文的回复
      // 格式: conversation_id:tweetId
      const query = `conversation_id:${tweetId}`;
      
      const result = await this.client.v2.search({
        query,
        max_results: maxResults,
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'in_reply_to_user_id', 'referenced_tweets'],
        expansions: ['author_id', 'referenced_tweets.id', 'in_reply_to_user_id'],
        'user.fields': ['name', 'username', 'profile_image_url'],
      });

      // 过滤出直接回复给指定推文的内容
      const directReplies = result.data.data?.filter(tweet => 
        tweet.referenced_tweets?.some(ref => 
          ref.type === 'replied_to' && ref.id === tweetId
        )
      ) || [];

      return {
        success: true,
        data: directReplies,
        includes: result.includes,
        meta: result.meta,
      };
    } catch (error) {
      console.error('获取推文回复失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取当前用户ID
   * @returns 用户ID
   */
  private async getUserId(): Promise<string> {
    const me = await this.client.v2.me();
    return me.data.id;
  }
}

/**
 * 创建 X 客户端实例
 * @param apiKey API 密钥
 * @param apiSecret API 密钥秘密
 * @param accessToken 访问令牌
 * @param accessSecret 访问令牌秘密
 * @returns XClient 实例
 */
export function createXClient(
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string
): XClient {
  return new XClient(apiKey, apiSecret, accessToken, accessSecret);
}
