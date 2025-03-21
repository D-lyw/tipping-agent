import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { xAgent } from '../agents/xAgent';
import { replyMonitor } from '../../lib/replyMonitor';

/**
 * 搜索推文步骤
 */
const searchTweetsStep = new Step({
  id: 'search-tweets',
  description: '搜索 Twitter 上的推文',
  inputSchema: z.object({
    query: z.string().describe('搜索关键词'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 10'),
  }),
  execute: async ({ context }) => {
    const { query, maxResults = 10 } = context.inputData;
    
    const response = await xAgent.generate(
      `请搜索关于 "${query}" 的推文，最多返回 ${maxResults} 条结果。`
    );

    return {
      query,
      maxResults,
      result: response.text,
    };
  },
});

/**
 * 发布推文步骤
 */
const postTweetStep = new Step({
  id: 'post-tweet',
  description: '发布一条推文',
  inputSchema: z.object({
    text: z.string().max(280).describe('推文内容，最多 280 字符'),
    shouldMonitor: z.boolean().optional().describe('是否监控该推文的回复，默认为 false'),
  }),
  execute: async ({ context }) => {
    const { text, shouldMonitor = false } = context.inputData;
    
    const response = await xAgent.generate(
      `请发布以下内容的推文：${text}`
    );

    // 尝试从响应中提取推文 ID
    try {
      if (shouldMonitor && response.text) {
        const idMatch = response.text.match(/ID[：:]\s*(\d+)/i);
        if (idMatch && idMatch[1]) {
          const tweetId = idMatch[1];
          console.log(`将监控推文 ID: ${tweetId} 的回复`);
          
          // 获取当前用户 ID
          const meResponse = await xAgent.generate('请获取当前用户的 ID');
          const userIdMatch = meResponse.text.match(/ID[：:]\s*(\d+)/i);
          const userId = userIdMatch ? userIdMatch[1] : '';
          
          if (userId) {
            // 添加到监控列表
            replyMonitor.addTweetToMonitor(tweetId, userId);
            
            // 确保监控服务已启动
            replyMonitor.start();
          }
        }
      }
    } catch (error) {
      console.error('添加推文监控失败:', error);
    }

    return {
      text,
      result: response.text,
    };
  },
});

/**
 * 回复推文步骤
 */
const replyToTweetStep = new Step({
  id: 'reply-to-tweet',
  description: '回复一条推文',
  inputSchema: z.object({
    tweetId: z.string().describe('要回复的推文 ID'),
    text: z.string().max(280).describe('回复内容，最多 280 字符'),
    shouldMonitor: z.boolean().optional().describe('是否监控该回复的回复，默认为 true'),
  }),
  execute: async ({ context }) => {
    const { tweetId, text, shouldMonitor = true } = context.inputData;
    
    const response = await xAgent.generate(
      `请回复 ID 为 ${tweetId} 的推文，回复内容：${text}`
    );

    // 尝试从响应中提取回复的推文 ID
    try {
      if (shouldMonitor && response.text) {
        const idMatch = response.text.match(/ID[：:]\s*(\d+)/i);
        if (idMatch && idMatch[1]) {
          const replyId = idMatch[1];
          console.log(`将监控回复 ID: ${replyId} 的回复`);
          
          // 获取当前用户 ID
          const meResponse = await xAgent.generate('请获取当前用户的 ID');
          const userIdMatch = meResponse.text.match(/ID[：:]\s*(\d+)/i);
          const userId = userIdMatch ? userIdMatch[1] : '';
          
          if (userId) {
            // 添加到监控列表
            replyMonitor.addTweetToMonitor(replyId, userId);
            
            // 确保监控服务已启动
            replyMonitor.start();
          }
        }
      }
    } catch (error) {
      console.error('添加回复监控失败:', error);
    }

    return {
      tweetId,
      text,
      result: response.text,
    };
  },
});

/**
 * 获取用户时间线步骤
 */
const getUserTimelineStep = new Step({
  id: 'get-user-timeline',
  description: '获取用户的时间线',
  inputSchema: z.object({
    userId: z.string().describe('用户 ID'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 10'),
  }),
  execute: async ({ context }) => {
    const { userId, maxResults = 10 } = context.inputData;
    
    const response = await xAgent.generate(
      `请获取用户 ID 为 ${userId} 的时间线，最多返回 ${maxResults} 条结果。`
    );

    return {
      userId,
      maxResults,
      result: response.text,
    };
  },
});

/**
 * 点赞推文步骤
 */
const likeTweetStep = new Step({
  id: 'like-tweet',
  description: '点赞一条推文',
  inputSchema: z.object({
    tweetId: z.string().describe('要点赞的推文 ID'),
  }),
  execute: async ({ context }) => {
    const { tweetId } = context.inputData;
    
    const response = await xAgent.generate(
      `请点赞 ID 为 ${tweetId} 的推文。`
    );

    return {
      tweetId,
      result: response.text,
    };
  },
});

/**
 * 获取推文回复步骤
 */
const getTweetRepliesStep = new Step({
  id: 'get-tweet-replies',
  description: '获取推文的回复列表',
  inputSchema: z.object({
    tweetId: z.string().describe('推文 ID'),
    maxResults: z.number().optional().describe('最大结果数量，默认为 20'),
  }),
  execute: async ({ context }) => {
    const { tweetId, maxResults = 20 } = context.inputData;
    
    const response = await xAgent.generate(
      `请获取 ID 为 ${tweetId} 的推文的回复列表，最多返回 ${maxResults} 条结果。`
    );

    return {
      tweetId,
      maxResults,
      result: response.text,
    };
  },
});

/**
 * 开始监控推文回复步骤
 */
const startMonitoringTweetStep = new Step({
  id: 'start-monitoring-tweet',
  description: '开始监控推文的回复',
  inputSchema: z.object({
    tweetId: z.string().describe('要监控的推文 ID'),
    userId: z.string().optional().describe('发推文的用户 ID，如果不提供将自动获取当前用户 ID'),
  }),
  execute: async ({ context }) => {
    const { tweetId, userId: providedUserId } = context.inputData;
    
    let userId = providedUserId;
    
    // 如果没有提供用户 ID，则获取当前用户 ID
    if (!userId) {
      const meResponse = await xAgent.generate('请获取当前用户的 ID');
      const userIdMatch = meResponse.text.match(/ID[：:]\s*(\d+)/i);
      userId = userIdMatch ? userIdMatch[1] : '';
    }
    
    if (!userId) {
      return {
        success: false,
        error: '无法获取用户 ID',
        tweetId
      };
    }
    
    // 添加到监控列表
    replyMonitor.addTweetToMonitor(tweetId, userId);
    
    // 确保监控服务已启动
    replyMonitor.start();
    
    return {
      success: true,
      tweetId,
      userId,
      message: `已开始监控推文 ${tweetId} 的回复`
    };
  },
});

/**
 * 停止监控推文回复步骤
 */
const stopMonitoringTweetStep = new Step({
  id: 'stop-monitoring-tweet',
  description: '停止监控推文的回复',
  inputSchema: z.object({
    tweetId: z.string().describe('要停止监控的推文 ID'),
  }),
  execute: async ({ context }) => {
    const { tweetId } = context.inputData;
    
    // 从监控列表中移除
    replyMonitor.removeTweetFromMonitor(tweetId);
    
    return {
      success: true,
      tweetId,
      message: `已停止监控推文 ${tweetId} 的回复`
    };
  },
});

/**
 * Twitter/X 工作流
 */
export const xWorkflow = new Workflow({
  name: 'x-workflow',
  triggerSchema: z.object({
    action: z.enum([
      'search-tweets', 
      'post-tweet', 
      'reply-to-tweet', 
      'get-user-timeline', 
      'like-tweet', 
      'get-tweet-replies',
      'start-monitoring-tweet',
      'stop-monitoring-tweet'
    ]).describe('要执行的 Twitter/X 操作'),
    query: z.string().optional().describe('搜索关键词（仅用于搜索推文）'),
    text: z.string().max(280).optional().describe('推文内容（用于发布或回复推文）'),
    tweetId: z.string().optional().describe('推文 ID（用于回复、点赞推文或获取回复）'),
    userId: z.string().optional().describe('用户 ID（用于获取用户时间线或监控推文）'),
    maxResults: z.number().optional().describe('最大结果数量（用于搜索推文、获取用户时间线或获取推文回复）'),
    shouldMonitor: z.boolean().optional().describe('是否监控推文的回复（用于发布或回复推文）'),
  }),
})
  .step(searchTweetsStep)
  .step(postTweetStep)
  .step(replyToTweetStep)
  .step(getUserTimelineStep)
  .step(likeTweetStep)
  .step(getTweetRepliesStep)
  .step(startMonitoringTweetStep)
  .step(stopMonitoringTweetStep);

xWorkflow.commit(); 