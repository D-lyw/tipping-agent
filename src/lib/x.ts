import { TwitterApi } from 'twitter-api-v2';

/**
 * 创建 X 客户端
 * @param apiKey Twitter API Key
 * @param apiSecret Twitter API Secret
 * @param accessToken Twitter Access Token
 * @param accessSecret Twitter Access Secret
 * @returns X 客户端实例
 */
export function createXClient(
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessSecret: string
) {
  // 创建 Twitter API 客户端
  const twitterClient = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
  
  // 获取只读客户端
  const readOnlyClient = twitterClient.readOnly;
  
  // 获取读写客户端
  const readWriteClient = twitterClient.readWrite;
  
  return {
    /**
     * 搜索最近的推文
     * @param query 搜索查询
     * @param options 搜索选项
     * @returns 搜索结果
     */
    searchRecentTweets: async (query: string, options: any = {}) => {
      try {
        const result = await readOnlyClient.v2.search(query, options);
        return {
          success: true,
          data: result.data.data,
          includes: result.data.includes,
          meta: result.data.meta
        };
      } catch (error) {
        console.error('搜索推文失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    /**
     * 获取推文回复
     * @param tweetId 推文 ID
     * @param options 选项
     * @returns 回复列表
     */
    getTweetReplies: async (tweetId: string, options: any = {}) => {
      try {
        // 使用搜索 API 查找回复
        const result = await readOnlyClient.v2.search(
          `conversation_id:${tweetId}`, 
          {
            'tweet.fields': ['author_id', 'created_at', 'text', 'in_reply_to_user_id'],
            'user.fields': ['username', 'name', 'profile_image_url'],
            ...options
          }
        );
        
        return {
          success: true,
          data: result.data.data,
          includes: result.data.includes,
          meta: result.data.meta
        };
      } catch (error) {
        console.error('获取推文回复失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    /**
     * 发布推文
     * @param text 推文内容
     * @param options 选项
     * @returns 发布结果
     */
    postTweet: async (text: string, options: any = {}) => {
      try {
        const result = await readWriteClient.v2.tweet(text, options);
        return {
          success: true,
          data: result.data
        };
      } catch (error) {
        console.error('发布推文失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    /**
     * 回复推文
     * @param tweetId 要回复的推文 ID
     * @param text 回复内容
     * @returns 回复结果
     */
    replyToTweet: async (tweetId: string, text: string) => {
      try {
        const result = await readWriteClient.v2.reply(text, tweetId);
        return {
          success: true,
          data: result.data
        };
      } catch (error) {
        console.error('回复推文失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    /**
     * 点赞推文
     * @param tweetId 推文 ID
     * @returns 点赞结果
     */
    likeTweet: async (tweetId: string) => {
      try {
        // 获取用户 ID
        const meUser = await readOnlyClient.v2.me();
        const userId = meUser.data.id;
        
        // 点赞推文
        await readWriteClient.v2.like(userId, tweetId);
        return {
          success: true,
          message: '点赞成功'
        };
      } catch (error) {
        console.error('点赞推文失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    /**
     * 转发推文
     * @param tweetId 推文 ID
     * @returns 转发结果
     */
    retweetTweet: async (tweetId: string) => {
      try {
        // 获取用户 ID
        const meUser = await readOnlyClient.v2.me();
        const userId = meUser.data.id;
        
        // 转发推文
        await readWriteClient.v2.retweet(userId, tweetId);
        return {
          success: true,
          message: '转发成功'
        };
      } catch (error) {
        console.error('转发推文失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

// 导出默认实例
export default createXClient;
