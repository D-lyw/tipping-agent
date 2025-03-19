/**
 * 测试 transferCKB 函数的 BigInt 序列化修复
 * 
 * 这个脚本专门测试 BigInt 序列化问题的修复
 */

import { transferCKB } from '../src/lib/ckb';
import * as dotenv from 'dotenv';

dotenv.config();

// 一个有效的测试网地址
const TEST_RECEIVER_ADDRESS = 'ckt1qp4wtmsvhzrm9h66ngvpxuc4hx7u2klg65nr0vk7qcjqjt2lpjga2qgqurg3lwr7hrq4zn0wtd9d2yvapw9mnhs0z0x74c';

// 自定义 JSON 序列化函数，可以处理 BigInt
function safeStringify(obj: any): string {
    return JSON.stringify(obj, (_key, value) => 
        typeof value === 'bigint' 
            ? value.toString() 
            : value
    );
}

async function main() {
    try {
        console.log('=== 测试 transferCKB 函数的 BigInt 序列化修复 ===');
        
        // 检查环境变量
        const privateKey = process.env.CKB_PRIVATE_KEY;
        if (!privateKey) {
            console.error('错误: 缺少 CKB_PRIVATE_KEY 环境变量');
            console.error('请设置: export CKB_PRIVATE_KEY=你的私钥');
            process.exit(1);
        }
        
        console.log('私钥已配置，准备测试转账...');
        
        // 测试 BigInt 序列化
        const testObj = { 
            normal: 123, 
            bigValue: BigInt(1000000000000)
        };
        
        console.log('===== 测试 BigInt 序列化 =====');
        try {
            console.log('标准序列化 (会失败):', JSON.stringify(testObj));
        } catch (error) {
            console.log('标准序列化失败，错误:', (error as any).message);
        }
        
        console.log('安全序列化 (应成功):', safeStringify(testObj));
        console.log('==============================');
        
        // 执行小额转账测试
        console.log('执行测试转账 (1 CKB)...');
        try {
            const txHash = await transferCKB(
                privateKey,
                TEST_RECEIVER_ADDRESS,
                1,  // 1 CKB
                true // 测试网
            );
            console.log('转账成功! 交易哈希:', txHash);
        } catch (error) {
            console.error('转账失败:', (error as any).message);
            if ((error as any).message.includes('BigInt')) {
                console.error('仍然存在 BigInt 序列化问题，需要进一步检查');
            }
        }
        
    } catch (error) {
        console.error('测试过程中发生错误:', error);
    }
}

main().catch(err => {
    console.error('运行测试时出错:', err);
}); 