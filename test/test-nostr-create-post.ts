import { nostrClient, nostrTools } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 创建一条测试帖子，用于后续回复测试
 */
async function createTestPost() {
  console.log('开始创建测试帖子...');

  // 首先测试中继连接
  console.log('测试中继连接...');
  const relayResults = await nostrTools.testAllRelays();
  
  // 检查有多少中继可用
  const availableRelays = Object.values(relayResults).filter(result => result === true).length;
  console.log(`找到 ${availableRelays} 个可用中继`);
  
  if (availableRelays === 0) {
    console.error('没有可用的中继服务器，测试失败');
    process.exit(1);
  }

  try {
    // 帖子内容
    const content = `这是一条测试帖子，用于测试 npub 格式公钥 - ${new Date().toISOString()}`;
    console.log(`帖子内容: ${content}`);

    // 添加标签
    const tags = [['t', 'test'], ['t', 'nostr']];

    // 发布帖子
    const eventId = await nostrClient.publishNote(content, tags);
    console.log(`帖子发布成功，事件 ID: ${eventId}`);
    console.log(`可以通过以下链接查看: https://snort.social/e/${eventId}`);
    
    // 输出环境变量设置指导
    console.log('\n请将以下内容添加到 .env 文件中:');
    console.log(`TEST_EVENT_ID=${eventId}`);
    console.log(`TEST_PUBKEY=${nostrClient.getPublicKeyHex()}`);

    return eventId;
  } catch (error) {
    console.error('发布测试帖子失败:', error);
    throw error;
  }
}

// 运行测试
createTestPost()
  .then(eventId => {
    console.log('测试帖子创建完成');
    
    // 将事件 ID 写入环境变量文件
    const fs = require('fs');
    try {
      let envContent = fs.readFileSync('.env', 'utf8');
      
      // 更新或添加 TEST_EVENT_ID 和 TEST_PUBKEY
      if (envContent.includes('TEST_EVENT_ID=')) {
        envContent = envContent.replace(/TEST_EVENT_ID=.*/g, `TEST_EVENT_ID=${eventId}`);
      } else {
        envContent += `\nTEST_EVENT_ID=${eventId}`;
      }
      
      if (envContent.includes('TEST_PUBKEY=')) {
        envContent = envContent.replace(/TEST_PUBKEY=.*/g, `TEST_PUBKEY=${nostrClient.getPublicKeyHex()}`);
      } else {
        envContent += `\nTEST_PUBKEY=${nostrClient.getPublicKeyHex()}`;
      }
      
      fs.writeFileSync('.env', envContent);
      console.log('已自动更新 .env 文件');
    } catch (err) {
      console.error('无法更新 .env 文件:', err);
      console.log('请手动更新 .env 文件');
    }
  })
  .catch(error => {
    console.error('测试过程中发生错误:', error);
  })
  .finally(() => {
    // 完成后延迟退出，确保所有日志都显示出来
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  }); 