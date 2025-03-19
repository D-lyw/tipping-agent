/**
 * 测试 npub 格式转换
 * 
 * 这个脚本直接测试将 npub 格式转换为 CKB 地址的功能
 */

import { convertNostrIdentifierToCkbAddress, decodeNip19 } from '../src/lib/nostrMonitor';

async function main() {
  try {
    // 测试用的 npub
    const npub = 'npub1j7948t0lwa3vznttp55nl73funfrynnkwy3pj67xnxadhv6fy7rqq393v4';
    
    console.log(`测试解码 npub: ${npub}`);
    
    // 首先解码 npub 格式
    const pubkey = decodeNip19(npub);
    console.log(`解码结果 (公钥): ${pubkey}`);
    
    // 然后转换为 CKB 地址
    console.log('开始转换为 CKB 地址...');
    const ckbAddress = await convertNostrIdentifierToCkbAddress(npub);
    
    console.log('转换结果:');
    console.log(`Nostr npub: ${npub}`);
    console.log(`提取的公钥: ${pubkey}`);
    console.log(`对应的 CKB 地址: ${ckbAddress}`);
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

main().catch(err => {
  console.error('运行测试时出错:', err);
}); 