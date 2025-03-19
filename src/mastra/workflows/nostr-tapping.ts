import { Step, Workflow } from "@mastra/core";
import { z } from "zod";
import { tappingAgent } from "../agents";
// 只需导入函数，不需要导入工具定义
import { convertNostrPubkeyToCkbAddress } from "../../lib/nostrMonitor";

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
        try {
            // 方法1: 直接使用导入的函数
            const ckbAddress = await convertNostrPubkeyToCkbAddress(context.triggerData.pubkey);
            
            // 方法2: 使用 agent 调用工具进行转换 (具体以您的框架实现为准)
            // const response = await tappingAgent.invoke('convertNostrPubkeyToCkbAddressTool', {
            //     nostrPubkey: context.triggerData.pubkey
            // });
            // const ckbAddress = response.ckbAddress;
            
            return {
                receiverAddress: ckbAddress,
            };
        } catch (error) {
            console.error('获取 Nostr 公钥对应的 CKB 地址失败:', error);
            
            // 如果工具调用失败，回退到直接使用函数
            const ckbAddress = await convertNostrPubkeyToCkbAddress(context.triggerData.pubkey);
            return {
                receiverAddress: ckbAddress,
            };
        }
    },
});

/**
 * Step 4: 验证地址是否有效
 */
const checkReceiverAddressStep = new Step({
    id: 'check-receiver-address',
    description: '验证接收地址是否有效',
    outputSchema: z.object({
        isExistAddress: z.boolean().describe('地址是否有效'),
    }),
    execute: async ({ context }) => {
        const { receiverAddress } = context.getStepResult<{ receiverAddress: string }>('get-receiver-address');
        // 简单验证地址是否存在，生产环境可能需要更复杂的验证
        const isExistAddress = !!receiverAddress && receiverAddress.length > 0;
        return {
            isExistAddress,
        };
    },
});

/**
 * Step 5: 发送评论，获取打赏地址
 */
const sendCommentStep = new Step({
    id: 'send-comment',
    description: '发送评论，获取打赏地址',
    execute: async ({ context, mastra }) => {
        // 发送评论逻辑
    },
});

/**
 * Step 6: 打赏
 */
const tappingStep = new Step({
    id: 'tapping',
    description: '打赏',
    execute: async ({ context }) => {
        const { receiverAddress } = context.getStepResult<{ receiverAddress: string }>('get-receiver-address');
        const { isExistAddress } = context.getStepResult<{ isExistAddress: boolean }>('check-receiver-address');
        if (isExistAddress) {
            // await mastra.tapping(receiverAddress, context.triggerData.content);
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
    .then(tappingStep)
    .then(sendCommentStep)
    .commit();
