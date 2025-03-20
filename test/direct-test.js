// 使用JavaScript直接测试CKB文档

// 导入必要的依赖
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as readline from 'readline';

// 加载环境变量
dotenv.config();

// 检查OpenAI API密钥
if (!process.env.OPENAI_API_KEY) {
  console.error('错误: 环境变量 OPENAI_API_KEY 未设置');
  console.error('请在 .env 文件中添加您的 OpenAI API Key');
  process.exit(1);
}

// 创建基本的文档检索工具
const documentRetrievalTool = {
  id: "document_retrieval",
  description: "搜索文档来回答问题",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '查询内容' }
    },
    required: ['query']
  },
  execute: async (context) => {
    console.log('正在执行文档检索工具...');
    const query = context.input?.query || "";
    
    // 这里只是一个示例，实际上我们只返回一个固定的回答
    return `找到相关文档：
    
CKB (Common Knowledge Base) 是一个无需许可的开源区块链平台，专注于提供可编程性和可扩展性。
它是Nervos网络的第一层区块链协议，采用了UTXO（未花费交易输出）模型和PoW（工作量证明）共识机制。

CKB允许开发者在链上存储任意状态和逻辑，从而支持智能合约、代币交易和复杂的去中心化应用程序。

Cell模型是CKB的核心概念，它是一种新型的数据结构，包含容量（大小）、数据（任意二进制数据）和脚本（确定访问规则）。
Cell模型为CKB提供了极高的灵活性和可组合性。

更多信息可以访问: https://docs.nervos.org`;
  }
};

// 创建一个简单的智能体
const ckbAgent = new Agent({
  name: 'CKB助手',
  instructions: '你是CKB生态技术专家，专门回答关于Nervos CKB区块链的技术问题。',
  model: openai(process.env.MODEL_NAME || 'gpt-4-turbo-preview'),
  tools: { documentRetrievalTool }
});

// 提问函数
async function askQuestion(question) {
  try {
    console.log('思考中...');
    const response = await ckbAgent.generate(question);
    
    // 提取回答文本
    const answer = typeof response === 'string' 
      ? response 
      : response.text || JSON.stringify(response);
      
    return answer;
  } catch (error) {
    console.error('询问问题时出错:');
    console.error(error);
    return `抱歉，处理您的问题时遇到了错误: ${error.message || '未知错误'}`;
  }
}

async function main() {
  console.log('欢迎使用CKB文档问答系统');
  console.log('提示: 输入"exit"退出程序, 输入"clear"清除对话历史\n');
  
  // 检查命令行参数中是否有问题
  const args = process.argv.slice(2);
  const question = args[0];
  
  if (question) {
    // 如果命令行提供了问题，直接回答
    console.log(`问题: ${question}`);
    const answer = await askQuestion(question);
    console.log('\n回答:');
    console.log(answer);
    return;
  }
  
  // 创建交互式接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const promptUser = () => {
    rl.question('请输入问题: ', async (input) => {
      const trimmedInput = input.trim();
      
      if (trimmedInput.toLowerCase() === 'exit') {
        console.log('感谢使用，再见！');
        rl.close();
        return;
      }
      
      if (trimmedInput.toLowerCase() === 'clear') {
        console.log('已清除对话历史\n');
        promptUser();
        return;
      }
      
      if (!trimmedInput) {
        console.log('请输入有效的问题');
        promptUser();
        return;
      }
      
      const answer = await askQuestion(trimmedInput);
      console.log('\n回答:');
      console.log(answer);
      console.log('\n-------------------\n');
      
      promptUser();
    });
  };
  
  promptUser();
}

// 处理异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 运行主函数
main().catch(error => {
  console.error('程序运行出错:', error);
  process.exit(1);
}); 