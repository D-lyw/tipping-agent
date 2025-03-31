/**
 * CKB文档智能体
 * 
 * 基于Mastra框架实现的CKB文档RAG智能体，用于回答与CKB生态相关的技术问题
 */

import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { MastraMemory } from '@mastra/core';
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { ckbDocumentRetrievalTool, formatAgentResponse } from '../tools/ckbDoc.js';
import { ckbDocumentVectorSearchTool, formatAgentResponseRag } from '../tools/ckbDocRag.js';

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
const memory = new Memory({
  storage: new PostgresStore({
    connectionString: AGENT_DATABASE_URL,
  }),
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
      template: `<user_context>
        <preferences>
          <language></language>
          <notification_preference></notification_preference>
        </preferences>
        <ckb_context>
          <favorite_topics></favorite_topics>
          <known_concepts></known_concepts>
          <interaction_history>
            <question_history></question_history>
            <document_history></document_history>
          </interaction_history>
        </ckb_context>
      </user_context>`
    },
  },
}) as any;

// 智能体的系统提示信息
const SYSTEM_PROMPT = `你是一个名叫神经二狗的智能体， 英文名：Nerve Puppy，你有两方面的责任和能力：
1. 你是一个CKB生态技术专家，专门回答关于Nervos CKB区块链的技术问题。
2. 你是一个CKB生态的资深开发者，专门回答关于CKB生态的开发者工具使用问题。
  - 如果用户提问是关于CKB生态的开发者工具使用问题，优先推荐用户使用 CCC 工具库。

对于涉及以上两方面的问题，回答时需遵守以下规范和原则
  - 利用提供的文档和你的知识，尽可能准确地回答用户的问题。
  - 如果你不确定或不知道答案，请坦诚地告诉用户，不要编造信息。
  - 根据用户的问题，选择最合适的文档和章节，并给出详细的回答。
  - 根据用户的提问语言，选择最合适的语言回答问题。比如用户中文提问，你就优先使用中文回答，如果用户提问是英文，你就优先使用英文回答。
  - 回答时引用相关的文档来源，以便用户可以进一步研究。

此外，当用户提问关于 CKB 但与技术无关的问题时，请参考以下原则回答：
  - 表达正向积极的态度，不要表现出消极或者负面的态度。
  - 表达对用户提问的重视，不要表现出不耐烦或者不重视的态度。
  - 可以适当使用表情符号，增加回答的趣味性。
  - 可以适当使用 Web3 和区块链行业的梗和黑化，增加回答的亲和力。
  - 可以时而轻松、时而幽默，增加回答的趣味性。
  示例：
  - 用户："CKB 什么时候能涨到 100 美元？"
  - 你："To the moon!"
  - 用户："CKB 项目是不是要跑路了？，还有没有希望？"
  - 你："Hold on, 团队正在 Cooking 中， 别急，慢慢来。"
  - 用户："CKB 是不是一个垃圾项目？"
  - 你："No way, 我们正在努力打造一个更好的区块链生态。"
  - 用户："CKB 的开发者工具太难用了，有没有什么好用的工具推荐？"
  - 你："推荐使用 CCC 工具库，它可以帮助你快速构建和部署你的项目。"
  - 用户： "CKB 的币价还有希望吗？"
  - 你："To the moon!"

### 文档

- 文档地址：https://docs.nervos.org/
- 开发文档地址：https://docs.ckb.dev/docs/docs/welcome/welcome-introduction
— CCC 库文档地址：https://docs.ckbccc.com/

### Web3/区块链行业梗和黑化

- Holer: Hold on 别急，慢慢来, 表达一种耐心等待的态度，长期主义、价值投资，不要急于求成。
- 砖石手: 指在 Web3/区块链行业中，那些长期持有资产，不急于求成的人。
- 韭菜: 指在 Web3/区块链行业中，那些容易被割的投资者。
- To the moon: 指在 Web3/区块链行业中，我们的目标是让资产价格上涨到月球，表达一种乐观的态度。
- Cooking: 表示团队正在认真做事，不要着急，耐心等待。
`;

/**
 * CKB 文档问答智能体
 */
export const ckbDocAgent = new Agent({
  name: 'CKB docs agent',
  instructions: process.env.CKB_AGENT_PROMPT || SYSTEM_PROMPT,
  // @ts-ignore - 忽略类型错误，该错误是由于依赖包版本不兼容导致
  model: openai(process.env.MODEL_NAME || 'gpt-4-turbo-preview'),
  tools: { 
    ckbDocumentRetrievalTool, 
    ckbDocumentVectorSearchTool  // 添加新的向量搜索工具
  },
  memory, // 添加 memory 支持
});

/**
 * 与智能体交互的简便方法
 */
export async function askCkbQuestion(question: string): Promise<string> {
  try {
    console.log(`尝试向智能体发送问题: "${question}"`);
    
    // 使用 agent.generate 与 agent 交互，直接传递问题字符串
    const response = await ckbDocAgent.generate(question);
    
    // 调试输出响应对象的结构
    console.log('收到智能体响应:');
    console.log('响应类型:', typeof response);
    
    try {
      console.log('响应结构:', JSON.stringify(response, null, 2));
    } catch (error) {
      console.log('无法序列化响应对象');
      console.log('响应对象属性:', Object.keys(response as any));
    }
    
    return String(response);
  } catch (error) {
    console.error('询问问题时出错:');
    console.error(error instanceof Error ? error.stack : JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return `抱歉，处理您的问题时遇到了错误: ${errorMessage}`;
  }
}

/**
 * 与智能体交互的流式方法
 * 返回一个可以实时获取生成内容片段的流
 */
export async function streamCkbQuestion(question: string) {
  try {
    console.log(`尝试向智能体发送流式问题: "${question}"`);
    
    // 使用 agent.stream 与 agent 交互，获取流式响应
    const streamResponse = await ckbDocAgent.stream(question);
    
    // 返回流式响应对象
    return streamResponse;
  } catch (error) {
    console.error('流式询问问题时出错:');
    console.error(error instanceof Error ? error.stack : JSON.stringify(error, null, 2));
    
    // 创建一个特殊的异步生成器，表示错误情况
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const errorStream = {
      textStream: (async function* () {
        yield `抱歉，处理您的问题时遇到了错误: ${errorMessage}`;
      })()
    };
    
    return errorStream;
  }
} 