/**
 * NIP-19 格式 Nostr 标识符转 CKB 地址示例
 * 
 * 此示例演示如何解码 NIP-19 格式的 Nostr 标识符并将其转换为 CKB 地址
 */

import { nostrTools } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
  try {
    // 获取命令行参数中的 NIP-19 标识符或公钥
    const identifier = process.argv[2];
    
    if (!identifier) {
      console.error('用法: npx tsx examples/nostr-nip19-to-ckb.ts <NIP-19标识符或公钥>');
      console.error('示例: npx tsx examples/nostr-nip19-to-ckb.ts nprofile1...');
      console.error('      npx tsx examples/nostr-nip19-to-ckb.ts npub1...');
      console.error('      npx tsx examples/nostr-nip19-to-ckb.ts 3862234c25e1ab3182797f7c3bbbfe8149e7e8362f59bec62699c5f596c0dbf3');
      process.exit(1);
    }

    console.log(`输入标识符: ${identifier}`);
    
    // 1. 尝试解码 NIP-19 标识符
    try {
      const pubkey = nostrTools.decodeNip19(identifier);
      console.log(`解码后的公钥: ${pubkey}`);
      
      // 2. 将公钥转换为 CKB 地址
      console.log('正在转换为 CKB 地址...');
      const ckbAddress = await nostrTools.convertNostrIdentifierToCkbAddress(identifier);
      
      console.log('--------------------------');
      console.log('转换结果:');
      console.log(`Nostr 原始标识符: ${identifier}`);
      console.log(`提取的公钥: ${pubkey}`);
      console.log(`对应的 CKB 地址: ${ckbAddress}`);
      console.log('--------------------------');
    } catch (error) {
      console.error('转换过程中出错:', error.message);
      
      // 提供更多上下文信息
      if (identifier.startsWith('nprofile1') || identifier.startsWith('npub1')) {
        console.log('\n提示：这是一个 NIP-19 格式的标识符，需要先解码才能获取公钥。');
        console.log('请确保您的 nostr-tools 库是最新版本，支持 NIP-19 解码。');
      } else if (!/^[0-9a-f]{64}$/i.test(identifier)) {
        console.log('\n提示：输入的不是有效的 Nostr 公钥或 NIP-19 标识符。');
        console.log('有效的公钥应该是 64 个十六进制字符。');
        console.log('有效的 NIP-19 标识符应该以 npub1 或 nprofile1 开头。');
      }
    }
  } catch (error) {
    console.error('程序执行出错:', error);
    process.exit(1);
  }
}

// 运行主函数
main().catch(err => {
  console.error('运行示例时出错:', err);
  process.exit(1);
}); 