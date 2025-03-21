import { nostrClient, nostrTools, decodeNip19 } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 测试 npub 格式公钥的处理
 */
async function testNpubFormat() {
  console.log('开始测试 npub 格式公钥处理...');

  // 获取当前客户端的 npub 格式公钥
  const npubKey = nostrClient.getPublicKey();
  console.log(`当前客户端公钥 (npub 格式): ${npubKey}`);

  // 获取十六进制格式公钥
  const hexKey = nostrClient.getPublicKeyHex();
  console.log(`当前客户端公钥 (十六进制): ${hexKey}`);

  // 测试解码 npub
  console.log('\n测试 npub 解码:');
  try {
    const decodedKey = decodeNip19(npubKey);
    console.log(`解码 ${npubKey} => ${decodedKey}`);
    console.log(`解码结果与十六进制公钥匹配: ${decodedKey === hexKey}`);
  } catch (error) {
    console.error('解码 npub 失败:', error);
  }

  // 测试 replyToNote 方法接受 npub 格式的公钥
  console.log('\n测试回复方法接受 npub 格式:');
  try {
    // 从环境变量获取测试事件
    const testEventId = process.env.TEST_EVENT_ID || '';
    if (!testEventId) {
      console.warn('未设置 TEST_EVENT_ID 环境变量，跳过回复测试');
      return;
    }

    // 使用自己的 npub 作为回复对象
    console.log(`将使用 npub 格式公钥: ${npubKey}`);
    console.log(`回复事件 ID: ${testEventId}`);

    // 测试内容
    const content = `这是一条使用 npub 格式公钥的测试回复 - ${new Date().toISOString()}`;
    
    // 调用 replyToNote 方法，传入 npub 格式公钥
    const replyId = await nostrClient.replyToNote(
      testEventId,
      npubKey,  // 使用 npub 格式公钥
      content
    );

    console.log(`回复成功，回复 ID: ${replyId}`);
    console.log(`可以通过以下链接查看: https://snort.social/e/${replyId}`);
  } catch (error) {
    console.error('使用 npub 格式公钥回复失败:', error);
  }

  // 测试获取 CKB 地址
  console.log('\n测试 npub 格式公钥转换为 CKB 地址:');
  try {
    // 使用 npub 格式公钥获取 CKB 地址
    const ckbAddress = await nostrClient.getNostrPubkeyCkbAddress(npubKey);
    console.log(`npub 公钥 ${npubKey} 对应的 CKB 地址: ${ckbAddress}`);

    // 使用十六进制格式获取 CKB 地址进行对比
    const ckbAddressHex = await nostrClient.getNostrPubkeyCkbAddress(hexKey);
    console.log(`十六进制公钥 ${hexKey.substring(0, 10)}... 对应的 CKB 地址: ${ckbAddressHex}`);
    
    console.log(`两种格式获取的 CKB 地址一致: ${ckbAddress === ckbAddressHex}`);
  } catch (error) {
    console.error('转换为 CKB 地址失败:', error);
  }
}

// 运行测试
testNpubFormat()
  .then(() => {
    console.log('测试完成');
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