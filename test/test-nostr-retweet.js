#!/usr/bin/env node

/**
 * 测试 Nostr 转发功能的命令行工具
 * 
 * 使用方法:
 * node test/test-nostr-retweet.js <eventId> [comment]
 * 
 * 参数:
 * eventId - 要转发的事件ID (十六进制或note1格式)
 * comment - 可选的转发评论
 */

import { nostrClient } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';
import readline from 'readline';

// 加载环境变量
dotenv.config();

// 检查 OpenAI API 密钥
if (!process.env.NOSTR_PRIVATE_KEY) {
  console.error('错误: 未设置 NOSTR_PRIVATE_KEY 环境变量');
  process.exit(1);
}

// 创建命令行交互界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * 转发 Nostr 事件
 * @param {string} eventId 事件ID
 * @param {string} comment 转发评论(可选)
 */
async function retweetEvent(eventId, comment) {
  try {
    console.log(`准备转发事件: ${eventId}`);
    if (comment) {
      console.log(`转发评论: ${comment}`);
    } else {
      console.log('纯转发，无评论');
    }

    // 连接到 Nostr 网络
    await nostrClient.connect();
    console.log(`已连接到 Nostr 网络，使用公钥: ${nostrClient.getPublicKey()}`);

    // 查找事件信息以获取作者公钥
    console.log('查询事件信息...');
    
    // 模拟获取事件信息，实际项目中应从 Nostr 网络获取
    // 这里简单使用一个固定的测试公钥
    const pubkey = process.env.TEST_PUBKEY || '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245';
    
    // 执行转发
    const retweetId = await nostrClient.retweetNote(eventId, pubkey, comment || '');
    console.log(`转发成功! 事件ID: ${retweetId}`);
    
    return retweetId;
  } catch (error) {
    console.error('转发失败:', error);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('请提供要转发的事件ID');
      rl.question('输入要转发的事件ID: ', async (eventId) => {
        if (!eventId) {
          console.error('未提供事件ID，退出');
          rl.close();
          return;
        }
        
        rl.question('输入转发评论(可选，直接回车表示无评论): ', async (comment) => {
          try {
            await retweetEvent(eventId, comment);
            rl.close();
          } catch (error) {
            rl.close();
          }
        });
      });
    } else {
      const eventId = args[0];
      const comment = args[1] || ''; // 可选的评论
      await retweetEvent(eventId, comment);
      rl.close();
    }
  } catch (error) {
    console.error('执行转发错误:', error);
    rl.close();
    process.exit(1);
  }
}

// 处理程序异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  rl.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  rl.close();
  process.exit(1);
});

// 开始执行主函数
main(); 