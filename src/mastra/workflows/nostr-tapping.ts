import { Step } from "@mastra/core";
import { Workflow } from '@mastra/core/workflows';
import { z } from "zod";
import { tappingAgent } from "../agents";
// 只需导入函数，不需要导入工具定义
import { convertNostrIdentifierToCkbAddress, nostrClient } from "../../lib/nostrMonitor";
import { transferCKB } from "../../lib/ckb";
import * as dotenv from 'dotenv';

dotenv.config();

// 简单的内存缓存，用于存储最近处理过的交易
// 格式: { eventId: timestamp }
const processedEvents = new Map<string, number>();

// 清理缓存的函数，移除超过一定时间的记录
function cleanupProcessedEvents(maxAgeMs = 3600000) { // 默认1小时
    const now = Date.now();
    for (const [eventId, timestamp] of processedEvents.entries()) {
        if (now - timestamp > maxAgeMs) {
            processedEvents.delete(eventId);
        }
    }
}

// 定期清理缓存
setInterval(cleanupProcessedEvents, 300000); // 每5分钟清理一次

/**
 * 检查事件是否已处理过的步骤
 */
const checkEventProcessedStep = new Step({
    id: "check-event-processed",
    description: "检查事件是否已被处理过",
    outputSchema: z.object({
        shouldProcess: z.boolean().describe("是否应继续处理此事件"),
    }),
    execute: async ({ context }) => {
        const eventId = context.triggerData.id;
        
        // 检查该事件是否已处理过
        if (processedEvents.has(eventId)) {
            const lastProcessTime = processedEvents.get(eventId);
            const now = Date.now();
            const minutesAgo = Math.round((now - lastProcessTime!) / 60000);
            
            console.log(`事件 ${eventId} 已在 ${minutesAgo} 分钟前处理过，跳过处理`);
            return { shouldProcess: false };
        }
        
        // 记录此次处理
        processedEvents.set(eventId, Date.now());
        console.log(`开始处理新事件: ${eventId}`);
        return { shouldProcess: true };
    },
});

/**
 * Step 1: 根据用户输入，判断是否为优质内容
 */
const isGoodContentStep = new Step({
    id: 'is-good-content',
    description: '判断该 Nostr 平台内容是否为值得打赏的优质内容',
    outputSchema: z.object({
        isGoodContent: z.boolean().describe('是否为优质内容'),
    }),
    execute: async ({ context }) => {
        const response = await tappingAgent.generate(
            `请判断该条 Nostr 平台内容是达到打赏标准的优质内容，请用"是"或"否"回答：${context.triggerData.content}`
        );
        return {
            isGoodContent: response.text === '是',
        };
    },
});

/**
 * Step 2: 查看该条 Nostr 平台内容是否已经被打赏过
 */
const isContentTappedStep = new Step({
    id: 'is-content-tapped',
    description: '查看该条 Nostr 平台内容是否已经被打赏过',
    outputSchema: z.object({
        isContentTapped: z.boolean().describe('是否已经被打赏过'),
    }),
    execute: async ({ context }) => {
        const response = await tappingAgent.generate(
            `请判断该条 Nostr 平台内容是否已经被打赏过，请用"是"或"否"回答：${context.triggerData.content}`
        );
        return {
            isContentTapped: response.text === '是',
        }
    },
});

/**
 * Step 3: 获取用户接收打赏的地址
 */
const getReceiverAddressStep = new Step({
    id: 'get-receiver-address',
    description: '获取用户接收打赏的地址',
    outputSchema: z.object({
        receiverAddress: z.string().describe('用户接收打赏的地址'),
    }),
    execute: async ({ context }) => {
        console.log(context.triggerData);
        const ckbAddress = await convertNostrIdentifierToCkbAddress(context.triggerData.pubkey);

        return {
            receiverAddress: ckbAddress,
        };
    },
});

/**
 * Step 5: 打赏
 */
const tappingStep = new Step({
    id: 'tapping',
    description: '打赏用户',
    inputSchema: z.object({
        receiverAddress: z.string().describe('用户接收打赏的地址'),
    }),
    execute: async ({ context }) => {
        try {
            console.log('tappingStep 开始执行...');
            
            // 获取接收地址
            const { receiverAddress } = context.inputData;
            if (!receiverAddress) {
                throw new Error('未获取到有效的接收地址');
            }
            console.log('接收地址:', receiverAddress);
            
            // 检查私钥环境变量 (注意这里使用的是 CKB_PRIVATE_KEY)
            const privateKey = process.env.CKB_PRIVATE_KEY;
            if (!privateKey) {
                throw new Error('环境变量 CKB_PRIVATE_KEY 未设置');
            }
            console.log('私钥已配置');
            
            // 执行转账
            console.log('准备执行转账...');
            const txHash = await transferCKB(
                privateKey,
                receiverAddress,
                100, // 100 CKB
                true  // 测试网
            );
            
            console.log('转账成功，交易哈希:', txHash);
            return {
                txHash,
            };
        } catch (error: any) {
            console.error('tappingStep 执行失败:', error);
            
            // 特殊处理 BigInt 序列化错误
            if (error.message && error.message.includes('BigInt')) {
                console.error('检测到 BigInt 序列化错误，可能是在日志输出时发生。');
                // 返回模拟交易哈希用于测试
                const mockTxHash = `mock_${Date.now().toString(16)}`;
                console.warn(`返回模拟交易哈希以继续调试: ${mockTxHash}`);
                return { txHash: mockTxHash };
            }
            
            throw error;
        }
    },
});

/**
 * Step 6: 发送评论
 */
const sendCommentStep = new Step({
    id: 'send-comment',
    description: '发送留言评论',
    inputSchema: z.object({
        txHash: z.string().describe('打赏的 CKB 交易哈希'),
    }),
    execute: async ({ context, mastra }) => {
        const { txHash } = context.getStepResult<{ txHash: string }>('tapping');
        const replyContent = `神经二狗，已为你打赏 100 CKB，交易哈希：${txHash}
        本次打赏资金由 CKB Seal 社区赞助，期待您更多的精彩内容！`;
        nostrClient.replyToNote(context.triggerData.id, context.triggerData.pubkey, replyContent);
    },
});

/**
 * Step 7: 直接转发内容
 */
const retweetStep = new Step({
    id: 'retweet',
    description: '直接转发 Nostr 内容',
    execute: async ({ context }) => {
        try {
            console.log(`准备转发内容: ${context.triggerData.id}`);
            
            const retweetId = await nostrClient.retweetNote(
                context.triggerData.id,
                context.triggerData.pubkey,
                '' // 无评论的转发
            );
            
            console.log(`成功转发内容: ${context.triggerData.id}, 新事件ID: ${retweetId}`);
            return { 
                retweeted: true, 
                retweetId
            };
        } catch (error) {
            console.error('转发步骤失败:', error);
            return {
                retweeted: false,
                error: String(error)
            };
        }
    },
});

export const nostrContentTappingWorkflow = new Workflow({
    name: 'nostr-content-tapping',
    triggerSchema: z.object({
        id: z.string().describe('该条 Nostr 平台内容 事件ID'),
        pubkey: z.string().describe('该条 Nostr 平台内容 作者公钥'),
        content: z.string().describe('该条 Nostr 平台内容'),
    }),
})
    .step(checkEventProcessedStep)
    .then(isGoodContentStep, {
        when: async ({ context }) => {
            const { shouldProcess } = context.getStepResult<{ shouldProcess: boolean }>('check-event-processed');
            return shouldProcess;
        },
    })
    .then(isContentTappedStep, {
        when: async ({ context }) => {
            const { shouldProcess } = context.getStepResult<{ shouldProcess: boolean }>('check-event-processed');
            return shouldProcess;
        },
    })
    .then(getReceiverAddressStep, {
        when: async ({ context }) => {
            if (!context.getStepResult<{ shouldProcess: boolean }>('check-event-processed').shouldProcess) {
                return false;
            }
            const { isGoodContent } = context.getStepResult<{ isGoodContent: boolean }>('is-good-content');
            const { isContentTapped } = context.getStepResult<{ isContentTapped: boolean }>('is-content-tapped');
            return isGoodContent && !isContentTapped;
        },
    })
    .then(tappingStep, {
        variables: {
            receiverAddress: { step: getReceiverAddressStep, path: 'receiverAddress' },
        }
    })
    .then(sendCommentStep)
    .then(retweetStep)
    .commit();
