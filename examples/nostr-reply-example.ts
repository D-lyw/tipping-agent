/**
 * Nostr 回复示例
 * 本示例演示如何初始化 NostrMonitor 并使用它回复 Nostr 平台上的特定内容
 */

import { NostrMonitor } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 获取环境变量
const privateKey = process.env.NOSTR_PRIVATE_KEY;
const relays = process.env.NOSTR_RELAYS?.split(',') || [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol'
];
const monitoredTags = process.env.NOSTR_MONITORED_TAGS?.split(',') || ['ckb', 'nervos'];

async function main() {
  try {
    // 检查必要的环境变量
    if (!privateKey) {
      console.error('错误: 未设置 NOSTR_PRIVATE_KEY 环境变量');
      process.exit(1);
    }

    // 初始化 NostrMonitor
    const monitor = new NostrMonitor({
      relays,
      monitoredTags,
      privateKey
    });

    // 等待连接建立
    await monitor.initialize();
    console.log('NostrMonitor 已初始化');

    // 要回复的事件 ID 和公钥 (这里需要替换为实际的 ID 和公钥)
    const eventIdToReply = process.argv[2];
    const pubkeyToReply = process.argv[3];
    
    if (!eventIdToReply || !pubkeyToReply) {
      console.error('用法: tsx examples/nostr-reply-example.ts <事件ID> <作者公钥>');
      monitor.stopMonitoring();
      process.exit(1);
    }

    // 回复内容
    const replyContent = `这是一条回复测试消息，发送于 ${new Date().toISOString()}`;
    
    // 添加一些额外标签
    const additionalTags = [
      ['t', 'ckb'],
      ['t', 'nervos'],
      ['t', 'test']
    ];

    console.log(`准备回复事件 ${eventIdToReply}`);
    console.log(`回复内容: ${replyContent}`);

    // 发送回复
    const replyId = await monitor.replyToNote(
      eventIdToReply,
      pubkeyToReply,
      replyContent,
      additionalTags
    );

    console.log(`回复已发送，回复 ID: ${replyId}`);

    // 等待一段时间后关闭连接
    await new Promise(resolve => setTimeout(resolve, 5000));
    monitor.stopMonitoring();
    console.log('已关闭连接');

  } catch (error) {
    console.error('发生错误:', error);
    process.exit(1);
  }
}

// 运行主函数
main().catch(err => {
  console.error('运行示例时出错:', err);
  process.exit(1);
}); 