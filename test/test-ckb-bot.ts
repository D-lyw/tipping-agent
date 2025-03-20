/**
 * CKB 文档问答智能体测试脚本
 * 
 * 用于在命令行测试 CKB 文档问答功能
 */

import { askCkbQuestion } from '../src/mastra/agents/ckbDocAgent.js';
import { fetchAllDocuments } from '../src/lib/ckbDocuments.js';
import dotenv from 'dotenv';
import { createInterface } from 'readline';

// 加载环境变量
dotenv.config();

// 检查命令行参数
const args = process.argv.slice(2);
const forceRefreshDocs = args.includes('--refresh') || process.env.FORCE_REFRESH_DOCS === 'true';

// 检查 OpenAI API Key
if (!process.env.OPENAI_API_KEY) {
  console.error('错误: 环境变量 OPENAI_API_KEY 未设置');
  console.error('请在 .env 文件中添加您的 OpenAI API Key');
  process.exit(1);
}

// 创建命令行交互界面
const readline = createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('正在初始化 CKB 文档智能体...');
  
  // 如果需要，强制刷新文档缓存
  if (forceRefreshDocs) {
    console.log('强制刷新文档缓存...');
    try {
      await fetchAllDocuments(true);
    } catch (error) {
      console.error('刷新文档失败:', error);
      process.exit(1);
    }
  }
  
  console.log('CKB 文档智能体初始化完成');
  
  // 检查命令行参数中是否有问题
  const question = args.filter(arg => !arg.startsWith('--'))[0];
  if (question) {
    console.log(`处理问题: "${question}"`);
    
    try {
      console.log('思考中...');
      const answer = await askCkbQuestion(question);
      console.log('\n回答:');
      console.log(answer);
      process.exit(0);
    } catch (error) {
      console.error('处理问题时出错:');
      if (error instanceof Error) {
        console.error(error.stack);
      } else {
        console.error(JSON.stringify(error, null, 2));
      }
      process.exit(1);
    }
  } else {
    // 如果没有直接提供问题，则启动交互模式
    console.log('输入您的问题，或输入 "exit" 退出');
    console.log('使用 "clear" 清除对话历史');
    console.log('-'.repeat(50));
    
    // 循环接收用户输入
    const askQuestion = () => {
      readline.question('您的问题: ', async (question) => {
        const trimmedQuestion = question.trim();
        
        // 检查是否退出
        if (trimmedQuestion.toLowerCase() === 'exit') {
          console.log('感谢使用，再见！');
          readline.close();
          process.exit(0);
        }
        
        // 清除历史
        if (trimmedQuestion.toLowerCase() === 'clear') {
          console.log('已清除对话历史');
          console.log('-'.repeat(50));
          askQuestion();
          return;
        }
        
        // 空问题
        if (!trimmedQuestion) {
          console.log('请输入问题内容');
          askQuestion();
          return;
        }
        
        try {
          console.log('思考中...');
          const answer = await askCkbQuestion(trimmedQuestion);
          console.log('\n回答:');
          console.log(answer);
          console.log('-'.repeat(50));
        } catch (error) {
          console.error('处理问题时出错:');
          if (error instanceof Error) {
            console.error(error.stack);
          } else {
            console.error(JSON.stringify(error, null, 2));
          }
        }
        
        // 继续下一个问题
        askQuestion();
      });
    };
    
    // 开始提问循环
    askQuestion();
  }
}

// 处理错误
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

// 打印使用说明
if (forceRefreshDocs) {
  console.log('正在强制刷新文档缓存...');
}

// 运行主函数
main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
}); 