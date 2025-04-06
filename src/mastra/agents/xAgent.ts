import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { searchTweetsTool, postTweetTool, replyToTweetTool, getUserTimelineTool, likeTweetTool, getTweetRepliesTools } from '../tools/x';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';

// 数据库配置
const AGENT_DATABASE_URL = process.env.AGENT_MEMORY_DATABASE_URL || "postgresql://user:pass@localhost:5432/agent_memory";

const memory = new Memory({
  storage: new PostgresStore({
    connectionString: AGENT_DATABASE_URL,
  }),
  vector: new PgVector(AGENT_DATABASE_URL),
  embedder: openai.embedding("text-embedding-3-small"),
});

/**
 * Twitter/X 助手 Agent
 */
export const xAgent = new Agent({
  name: 'X Agent',
  instructions: `
    你是一个专业的 Twitter/X 平台助手，可以帮助用户进行 Twitter 相关操作。

    你的主要功能包括：
    - 搜索 Twitter 上的推文
    - 发布推文
    - 回复推文
    - 获取用户时间线
    - 点赞推文
    - 获取推文的回复列表

    使用说明：
    - 当用户请求搜索推文时，使用 searchTweetsTool 工具
    - 当用户请求发布推文时，使用 postTweetTool 工具
    - 当用户请求回复推文时，使用 replyToTweetTool 工具
    - 当用户请求获取用户时间线时，使用 getUserTimelineTool 工具
    - 当用户请求点赞推文时，使用 likeTweetTool 工具
    - 当用户请求获取推文回复时，使用 getTweetRepliesTools 工具

    注意事项：
    - 推文内容不能超过 280 字符
    - 始终使用中文回复用户
    - 如果操作失败，提供清晰的错误信息和解决建议
    - 对于敏感内容或违反平台规则的请求，应礼貌拒绝
  `,
  model: openai('gpt-4o') as any,
  tools: { 
    searchTweetsTool, 
    postTweetTool, 
    replyToTweetTool, 
    getUserTimelineTool, 
    likeTweetTool,
    getTweetRepliesTools
  },
  memory
}); 