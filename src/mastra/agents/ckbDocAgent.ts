/**
 * CKB文档智能体
 * 
 * 基于Mastra框架实现的CKB文档RAG智能体，用于回答与CKB生态相关的技术问题
 */

import { Agent } from '@mastra/core/agent';
// 重新导入 openai 函数
import { openai } from '@ai-sdk/openai';
import { ckbDocumentRetrievalTool, formatAgentResponse } from '../tools/ckbDoc.js';

// 智能体的系统提示信息
const SYSTEM_PROMPT = `你是一个CKB生态技术专家，专门回答关于Nervos CKB区块链的技术问题。
利用提供的文档和你的知识，尽可能准确地回答用户的问题。
如果你不确定或不知道答案，请坦诚地告诉用户，不要编造信息。
请用中文回答问题，除非用户明确要求使用其他语言。
回答时引用相关的文档来源，以便用户可以进一步研究。
`;

/**
 * CKB 文档问答智能体
 */
export const ckbDocAgent = new Agent({
  name: 'CKB文档助手',
  instructions: process.env.CKB_AGENT_PROMPT || SYSTEM_PROMPT,
  // @ts-ignore - 忽略类型错误，该错误是由于依赖包版本不兼容导致
  model: openai(process.env.MODEL_NAME || 'gpt-4-turbo-preview'),
  tools: { ckbDocumentRetrievalTool },
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
    
    return formatAgentResponse(response);
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