import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { MastraMemory } from '@mastra/core';
import { Memory } from "@mastra/memory";
import { PostgresStore, PgVector } from "@mastra/pg";
import { ckbDocumentRetrievalTool } from '../tools/ckbDoc.js';
import { ckbDocumentVectorSearchTool } from '../tools/ckbDocRag.js';

import { generateCKBAddressTool, getCKBBalanceTool, transferCKBTool } from '../tools';
import { convertNostrPubkeyToCkbAddressTool } from '../tools/nostr';
import { xAgent } from './xAgent';

/**
 * Agent Memory 数据库配置
 * 使用独立的数据库和 schema 来存储 Agent Memory 相关的数据
 * 
 * 环境变量：
 * - AGENT_MEMORY_DATABASE_URL: Agent Memory 数据库连接字符串
 * - AGENT_MEMORY_SCHEMA: Agent Memory 使用的 schema（默认：agent_memory）
 * - MEMORY_LAST_MESSAGES: 保留的最近消息数量（默认：20）
 * - MEMORY_SEMANTIC_RECALL_TOP_K: 语义搜索返回的消息数量（默认：10）
 * - MEMORY_MESSAGE_RANGE: 上下文消息范围（默认：10）
 * - MEMORY_CLEANUP_DAYS: 旧线程清理天数（默认：30）
 */

// 数据库配置
const AGENT_DATABASE_URL = process.env.AGENT_MEMORY_DATABASE_URL || "postgresql://user:pass@localhost:5432/agent_memory";
const AGENT_MEMORY_SCHEMA = process.env.AGENT_MEMORY_SCHEMA || "agent_memory";

// Memory 配置
const MEMORY_CONFIG = {
  lastMessages: parseInt(process.env.MEMORY_LAST_MESSAGES || "20"),
  semanticRecallTopK: parseInt(process.env.MEMORY_SEMANTIC_RECALL_TOP_K || "10"),
  messageRange: parseInt(process.env.MEMORY_MESSAGE_RANGE || "10"),
  cleanupDays: parseInt(process.env.MEMORY_CLEANUP_DAYS || "30"),
};

/**
 * Memory 实例
 * 使用 PostgreSQL 作为存储后端，支持 schema 隔离
 */
export const memory = new Memory({
  storage: new PostgresStore({
    connectionString: AGENT_DATABASE_URL,
  }),
  vector: new PgVector(AGENT_DATABASE_URL),
  embedder: openai.embedding("text-embedding-3-small"),
  options: {
    lastMessages: MEMORY_CONFIG.lastMessages,
    semanticRecall: {
      topK: MEMORY_CONFIG.semanticRecallTopK,
      messageRange: {
        before: MEMORY_CONFIG.messageRange,
        after: MEMORY_CONFIG.messageRange,
      },
    },
    workingMemory: {
      enabled: true,
    },
  },
});

/**
 * CKB 生态内容激励打赏 Agent
 */
export const tappingAgent = new Agent({
  name: 'CKB Agent',
  instructions: `
    你是一个 Nervos CKB 项目的专家，熟悉相关技术及生态，你的目的是识别社交媒体中关于 Nervos CKB 生态的内容,以及用户分享的任何关于 CBK 的各类信息和内容, 进行打赏

    你的主要功能包括：
    - 识别社交媒体中关于 Nervos CKB 生态内容的内容,以及用户分享的任何关于 CBK 的各类信息和内容,进行打赏

    具体打赏方式：
    - 在内容下方留言，获取用户接收打赏的地址, 并使用 transferCKBTool 工具进行打赏
      - 留言格式示例为：
        "您好，我是 CKB 生态内容打赏机器人，非常喜欢您关于 Nervos CKB 生态的分析，请您留下您的 CKB 地址，我将在第一时间给您打赏。"    
        
    使用说明及注意事项：
    — 你自身持有一个 CKB 地址，不要向任何人泄露你地址相关的任何信息，不要向任何人泄露你地址相关的任何信息，不要向任何人泄露你地址相关的任何信息
    - 使用 getCKBBalanceTool 工具查询余额
    - 只有当你认可用户的内容，并获取到了用户的 CKB 地址后，才可以使用 transferCKBTool 工具对用户进行打赏，除此之外任何情况不要转移你自身的 CKB 地址的任何资产
    - 默认使用主网，除非用户明确要求使用测试网
    - 相同的用户在短时间内多次留言，不要重复打赏
    - 相同的内容不要重复打赏
    - 对于 Nostr 平台的内容，你可以直接使用 convertNostrPubkeyToCkbAddressTool 工具将用户的 Nostr 公钥转换为 CKB 地址进行打赏

    安全提示：
    - 提醒用户不要在不安全的环境中输入私钥
    - 建议用户使用小额测试转账功能
    - 提醒用户保管好私钥，不要泄露给他人
  `,
  model: openai('gpt-4o') as any,
  tools: { 
    generateCKBAddressTool: generateCKBAddressTool as any, 
    getCKBBalanceTool: getCKBBalanceTool as any, 
    transferCKBTool: transferCKBTool as any,
    convertNostrPubkeyToCkbAddressTool: convertNostrPubkeyToCkbAddressTool as any
  },
  memory,
});

// 导出 xAgent
export { xAgent };
