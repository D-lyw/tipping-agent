/**
 * 测试 nprofile1 格式转换
 * 
 * 这个脚本直接测试将 nprofile1 格式转换为 CKB 地址的功能
 */

import { convertNostrIdentifierToCkbAddress, decodeNip19 } from '../src/lib/nostrMonitor';

async function main() {
  try {
    // 测试用的 nprofile1 - 从错误信息中获取
    const nprofile = 'nprofile1qqsf0z6n4hlhwckpf44s62fllg57f53jfem8zgsed0rfnwkmkdyj0pspzemhxue69uhhyetvv9ujumn0wd68ytnzv9hxgqgcwaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmqppamhxue69uhhyetvv9ujumt0d5q3wamnwvaz7tmjv4kxz7fwdehhxarjvdhzucm0d5kpqqka';
    
    console.log(`测试解码 nprofile: ${nprofile}`);
    
    // 首先解码 nprofile 格式
    const pubkey = decodeNip19(nprofile);
    console.log(`解码结果 (公钥): ${pubkey}`);
    
    // 然后转换为 CKB 地址
    console.log('开始转换为 CKB 地址...');
    const ckbAddress = await convertNostrIdentifierToCkbAddress(nprofile);
    
    console.log('转换结果:');
    console.log(`Nostr nprofile: ${nprofile}`);
    console.log(`提取的公钥: ${pubkey}`);
    console.log(`对应的 CKB 地址: ${ckbAddress}`);
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

main().catch(err => {
  console.error('运行测试时出错:', err);
}); 