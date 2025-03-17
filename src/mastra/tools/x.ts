import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createXClient } from '../../lib/x';

// 从环境变量获取 Twitter API 凭证
const apiKey = process.env.TWITTER_API_KEY || '';
const apiSecret = process.env.TWITTER_API_SECRET || '';
const accessToken = process.env.TWITTER_ACCESS_TOKEN || '';
const accessSecret = process.env.TWITTER_ACCESS_SECRET || '';

// 创建 X 客户端实例
const xClient = createXClient(apiKey, apiSecret, accessToken, accessSecret);

/**
 * 搜索推文工具
 */
export const searchTweetsTool = createTool({
  id: 'search-tweets',
  description: '搜索 Twitter 上的推文',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 10'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { query, maxResults = 10 } = context;
    return await xClient.searchTweets(query, maxResults);
  },
});

/**
 * 发布推文工具
 */
export const postTweetTool = createTool({
  id: 'post-tweet',
  description: '发布一条推文',
  inputSchema: z.object({
    text: z.string().max(280).describe('推文内容，最多 280 字符'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { text } = context;
    return await xClient.postTweet(text);
  },
});

/**
 * 回复推文工具
 */
export const replyToTweetTool = createTool({
  id: 'reply-to-tweet',
  description: '回复一条推文',
  inputSchema: z.object({
    tweetId: z.string().describe('要回复的推文 ID'),
    text: z.string().max(280).describe('回复内容，最多 280 字符'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { tweetId, text } = context;
    return await xClient.replyToTweet(tweetId, text);
  },
});

/**
 * 获取用户时间线工具
 */
export const getUserTimelineTool = createTool({
  id: 'get-user-timeline',
  description: '获取用户的时间线',
  inputSchema: z.object({
    userId: z.string().describe('用户 ID'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 10'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { userId, maxResults = 10 } = context;
    return await xClient.getUserTimeline(userId, maxResults);
  },
});

/**
 * 点赞推文工具
 */
export const likeTweetTool = createTool({
  id: 'like-tweet',
  description: '点赞一条推文',
  inputSchema: z.object({
    tweetId: z.string().describe('要点赞的推文 ID'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { tweetId } = context;
    return await xClient.likeTweet(tweetId);
  },
});

/**
 * 获取推文回复工具
 */
export const getTweetRepliesTools = createTool({
  id: 'get-tweet-replies',
  description: '获取推文的回复列表',
  inputSchema: z.object({
    tweetId: z.string().describe('推文 ID'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 20'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { tweetId, maxResults = 20 } = context;
    return await xClient.getTweetReplies(tweetId, maxResults);
  },
});

// 导出所有工具
export const xTools = {
  searchTweetsTool,
  postTweetTool,
  replyToTweetTool,
  getUserTimelineTool,
  likeTweetTool,
  getTweetRepliesTools,
}; 