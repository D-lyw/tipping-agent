/**
 * 测试 nprofile1 格式转换
 * 
 * 这个脚本直接测试将 nprofile1 格式转换为 CKB 地址的功能
 * 同时测试主网和测试网地址
 */

import { 
  convertNostrIdentifierToCkbAddress, 
  decodeNip19, 
  NETWORK_MAINNET, 
  NETWORK_TESTNET 
} from '../src/lib/nostrMonitor';

async function main() {
  try {
    // 测试用的 nprofile1 - 从错误信息中获取
    const nprofile = 'nprofile1qqsf0z6n4hlhwckpf44s62fllg57f53jfem8zgsed0rfnwkmkdyj0pspzemhxue69uhhyetvv9ujumn0wd68ytnzv9hxgqgcwaehxw309aex2mrp0yh8xmn0wf6zuum0vd5kzmqppamhxue69uhhyetvv9ujumt0d5q3wamnwvaz7tmjv4kxz7fwdehhxarjvdhzucm0d5kpqqka';
    
    console.log(`测试解码 nprofile: ${nprofile}`);
    
    // 首先解码 nprofile 格式
    const pubkey = decodeNip19(nprofile);
    console.log(`解码结果 (公钥): ${pubkey}`);
    
    // 然后转换为测试网 CKB 地址
    console.log('==========================================');
    console.log('开始转换为 CKB 测试网地址...');
    const testnetCkbAddress = await convertNostrIdentifierToCkbAddress(nprofile, NETWORK_TESTNET);
    
    console.log('转换结果 (测试网):');
    console.log(`Nostr nprofile: ${nprofile}`);
    console.log(`提取的公钥: ${pubkey}`);
    console.log(`对应的 CKB 测试网地址: ${testnetCkbAddress}`);
    
    // 转换为主网 CKB 地址
    console.log('==========================================');
    console.log('开始转换为 CKB 主网地址...');
    const mainnetCkbAddress = await convertNostrIdentifierToCkbAddress(nprofile, NETWORK_MAINNET);
    
    console.log('转换结果 (主网):');
    console.log(`Nostr nprofile: ${nprofile}`);
    console.log(`提取的公钥: ${pubkey}`);
    console.log(`对应的 CKB 主网地址: ${mainnetCkbAddress}`);
    console.log('==========================================');
    
    // 对比两种地址
    console.log('两种网络地址对比:');
    console.log(`测试网: ${testnetCkbAddress}`);
    console.log(`主网: ${mainnetCkbAddress}`);
    console.log(`地址是否相同: ${testnetCkbAddress === mainnetCkbAddress}`);
    console.log('注意: 不同网络的地址前缀不同，但应有相同的脚本哈希部分');
  } catch (error) {
    console.error('测试过程中出错:', error);
  }
}

main().catch(console.error); 