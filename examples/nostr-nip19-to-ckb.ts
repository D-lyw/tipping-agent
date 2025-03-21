/**
 * NIP-19 格式 Nostr 标识符转 CKB 地址示例
 * 
 * 此示例演示如何解码 NIP-19 格式的 Nostr 标识符并将其转换为 CKB 地址
 */

import { nostrTools } from '../src/lib/nostrMonitor';
import { NETWORK_MAINNET, NETWORK_TESTNET, NetworkType } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 帮助信息
function printHelp() {
  console.log('用法: npx tsx examples/nostr-nip19-to-ckb.ts [选项] <NIP-19标识符或公钥>');
  console.log('');
  console.log('选项:');
  console.log('  -h, --help             显示此帮助信息');
  console.log('  -n, --network <network> 指定网络类型 (mainnet 或 testnet，默认: testnet)');
  console.log('  -b, --both             同时显示主网和测试网地址');
  console.log('');
  console.log('示例:');
  console.log('  npx tsx examples/nostr-nip19-to-ckb.ts nprofile1...');
  console.log('  npx tsx examples/nostr-nip19-to-ckb.ts npub1...');
  console.log('  npx tsx examples/nostr-nip19-to-ckb.ts --network mainnet npub1...');
  console.log('  npx tsx examples/nostr-nip19-to-ckb.ts --both npub1...');
  console.log('  npx tsx examples/nostr-nip19-to-ckb.ts 3862234c25e1ab3182797f7c3bbbfe8149e7e8362f59bec62699c5f596c0dbf3');
  process.exit(0);
}

async function main() {
  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let identifier = '';
    let network: NetworkType = NETWORK_TESTNET;
    let showBoth = false;
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '-h' || arg === '--help') {
        printHelp();
      } else if (arg === '-n' || arg === '--network') {
        const nextArg = args[++i];
        if (!nextArg) {
          console.error('错误: --network 选项需要指定一个值 (mainnet 或 testnet)');
          process.exit(1);
        }
        
        if (nextArg.toLowerCase() === 'mainnet') {
          network = NETWORK_MAINNET;
        } else if (nextArg.toLowerCase() === 'testnet') {
          network = NETWORK_TESTNET;
        } else {
          console.error('错误: 网络类型必须是 mainnet 或 testnet');
          process.exit(1);
        }
      } else if (arg === '-b' || arg === '--both') {
        showBoth = true;
      } else {
        identifier = arg;
      }
    }
    
    if (!identifier) {
      console.error('错误: 必须提供一个 NIP-19 标识符或公钥');
      printHelp();
    }

    console.log(`输入标识符: ${identifier}`);
    
    // 1. 尝试解码 NIP-19 标识符
    try {
      const pubkey = nostrTools.decodeNip19(identifier);
      console.log(`解码后的公钥: ${pubkey}`);
      
      if (showBoth) {
        // 转换为测试网地址
        console.log('==========================================');
        console.log('正在转换为 CKB 测试网地址...');
        const testnetCkbAddress = await nostrTools.convertNostrIdentifierToCkbAddress(identifier, NETWORK_TESTNET);
        
        console.log('转换结果 (测试网):');
        console.log(`Nostr 原始标识符: ${identifier}`);
        console.log(`提取的公钥: ${pubkey}`);
        console.log(`对应的 CKB 测试网地址: ${testnetCkbAddress}`);
        
        // 转换为主网地址
        console.log('==========================================');
        console.log('正在转换为 CKB 主网地址...');
        const mainnetCkbAddress = await nostrTools.convertNostrIdentifierToCkbAddress(identifier, NETWORK_MAINNET);
        
        console.log('转换结果 (主网):');
        console.log(`Nostr 原始标识符: ${identifier}`);
        console.log(`提取的公钥: ${pubkey}`);
        console.log(`对应的 CKB 主网地址: ${mainnetCkbAddress}`);
        console.log('==========================================');
        
        // 对比两种地址
        console.log('两种网络地址对比:');
        console.log(`测试网: ${testnetCkbAddress}`);
        console.log(`主网: ${mainnetCkbAddress}`);
      } else {
        // 只转换为指定网络的地址
        console.log(`正在转换为 CKB ${network === NETWORK_MAINNET ? '主网' : '测试网'}地址...`);
        const ckbAddress = await nostrTools.convertNostrIdentifierToCkbAddress(identifier, network);
        
        console.log('--------------------------');
        console.log('转换结果:');
        console.log(`Nostr 原始标识符: ${identifier}`);
        console.log(`提取的公钥: ${pubkey}`);
        console.log(`对应的 CKB ${network === NETWORK_MAINNET ? '主网' : '测试网'}地址: ${ckbAddress}`);
        console.log('--------------------------');
      }
    } catch (error) {
      console.error('转换过程中出错:', error);
      
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
    console.error('处理命令行参数出错:', error);
  }
}

// 运行主函数
main().catch(console.error); 