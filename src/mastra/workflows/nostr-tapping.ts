import { Step } from "@mastra/core/workflows";
import { Workflow } from '@mastra/core/workflows';
import { z } from "zod";
import { tappingAgent } from "../agents";
// 只需导入函数，不需要导入工具定义
import { convertNostrIdentifierToCkbAddress, nostrClient } from "../../lib/nostrMonitor";
import { transferCKB } from "../../lib/ckb";
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

dotenv.config();

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
        // Mark only for demo day
        // const response = await tappingAgent.generate(
        //     `请判断该条 Nostr 平台内容是达到打赏标准的优质内容，请用"是"或"否"回答：${context.triggerData.content}`
        // );
        const response = await tappingAgent.generate(
            `请判断该条 Nostr 平台内容是不是有涉及 Nervos CKB 的任何信息，请用"是"或"否"回答：${context.triggerData.content}`
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
        try {
            // 定义JSON文件路径
            const tappedContentPath = path.join(process.cwd(), 'data/tapped-content.json');

            // 检查文件是否存在，如果不存在则创建空数组
            if (!existsSync(tappedContentPath)) {
                // 确保目录存在
                const dirPath = path.dirname(tappedContentPath);
                if (!existsSync(dirPath)) {
                    await fs.mkdir(dirPath, { recursive: true });
                }
                await fs.writeFile(tappedContentPath, JSON.stringify([], null, 2));
                console.log(`创建空的打赏记录文件: ${tappedContentPath}`);
                return { isContentTapped: false };
            }

            // 读取已打赏内容列表
            const fileContent = await fs.readFile(tappedContentPath, 'utf8');
            const tappedContent = JSON.parse(fileContent);

            // 检查当前内容是否在列表中
            const contentId = context.triggerData.id;
            const isTapped = tappedContent.some(item => item.id === contentId);

            console.log(`检查内容 ${contentId} 是否已打赏: ${isTapped}`);
            return { isContentTapped: isTapped };
        } catch (error) {
            console.error('检查内容是否已打赏时出错:', error);
            // 出错时保守处理，避免重复打赏
            return { isContentTapped: true };
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

            // 执行转账
            console.log('准备执行转账...');
            let txHash = '';
            try {
                txHash = await transferCKB(
                    receiverAddress,
                    100 // 100 CKB
                );
            } catch (error: any) {
                console.error('转账失败:', error);
                throw error;
            }

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
    execute: async ({ context }) => {
        try {
            const { txHash } = context.getStepResult<{ txHash: string }>('tapping');
            const replyContent = `谢谢您关于 CKB 生态的分享，您已被「神经二狗」pitch，已为你空投100CKB，交易哈希：${txHash}
            本次打赏资金由 CKB Seal 社区赞助，期待您更多的精彩内容！`;

            await nostrClient.replyToNote(context.triggerData.id, context.triggerData.pubkey, replyContent);

            // 记录已处理的内容到JSON文件
            const tappedContentPath = path.join(process.cwd(), 'data/tapped-content.json');
            let tappedContent = [];

            if (existsSync(tappedContentPath)) {
                const fileContent = await fs.readFile(tappedContentPath, 'utf8');
                tappedContent = JSON.parse(fileContent);
            }

            // 添加新处理的内容
            tappedContent.push({
                id: context.triggerData.id,
                pubkey: context.triggerData.pubkey,
                content: context.triggerData.content,
                txHash: txHash,
                timestamp: new Date().toISOString()
            });

            // 写回文件
            await fs.writeFile(tappedContentPath, JSON.stringify(tappedContent, null, 2));
            console.log(`已记录内容 ${context.triggerData.id} 到已打赏列表`);

            return { commented: true };
        } catch (error) {
            console.error('发送评论步骤失败:', error);
            return { commented: false, error: String(error) };
        }
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
    .step(isGoodContentStep)
    .then(isContentTappedStep)
    .then(getReceiverAddressStep, {
        when: async ({ context }) => {
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
