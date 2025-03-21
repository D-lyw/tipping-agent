import { nostrClient, nostrTools } from '../src/lib/nostrMonitor';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
    try {
        console.log('开始测试 Nostr 发布功能...');
        
        // 1. 测试中继连接
        console.log('测试中继连接...');
        const relayResults = await nostrTools.testAllRelays();
        
        // 查找可用的中继
        const workingRelays = Object.entries(relayResults)
            .filter(([_, success]) => success)
            .map(([relay]) => relay);
            
        console.log(`找到 ${workingRelays.length} 个可用中继: ${workingRelays.join(', ')}`);
        
        if (workingRelays.length === 0) {
            console.error('没有可用的中继服务器，无法继续测试');
            process.exit(1);
        }
        
        // 2. 使用可用的中继发布测试内容
        console.log('尝试发布测试内容...');
        
        try {
            // 获取当前公钥
            const publicKey = nostrClient.getPublicKey();
            console.log(`使用公钥: ${publicKey}`);
            
            // 发布测试内容
            const content = `这是一条测试消息 - 时间戳 ${Date.now()}`;
            const tags = [['t', 'test'], ['t', 'ckb']];
            
            console.log(`发布内容: ${content}`);
            console.log(`标签: ${JSON.stringify(tags)}`);
            
            // 发布笔记
            const eventId = await nostrClient.publishNote(content, tags);
            console.log(`成功发布笔记! 事件 ID: ${eventId}`);
            
            // 测试回复功能
            console.log('测试回复功能...');
            const replyContent = `这是对刚刚发布的笔记的回复 - 时间戳 ${Date.now()}`;
            const replyId = await nostrClient.replyToNote(eventId, publicKey, replyContent);
            console.log(`成功发布回复! 回复 ID: ${replyId}`);
            
            console.log('测试成功完成!');
        } catch (error) {
            console.error('发布测试内容失败:', error);
        }
    } catch (error) {
        console.error('测试过程中出错:', error);
    } finally {
        // 清理资源
        process.exit(0);
    }
}

main(); 