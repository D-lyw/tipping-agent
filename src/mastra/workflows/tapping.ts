import { Step } from "@mastra/core/workflows";
import { Workflow } from '@mastra/core/workflows';
import { z } from "zod";
import { tappingAgent } from "../agents";

/**
 * Step 1: 根据用户输入，判断是否为优质内容
 */
const isGoodContentStep = new Step({
    id: 'is-good-content',
    description: '判断用户输入内容是否为值得打赏的优质内容',
    outputSchema: z.object({
        isGoodContent: z.boolean().describe('是否为优质内容'),
    }),
    execute: async ({ context }) => {
        const response = await tappingAgent.generate(
            `请判断以下内容是达到打赏标准的优质内容，请用"是"或"否"回答：${context.triggerData.content}`
        );
        return {
            isGoodContent: response.text === '是',
        };
    },
});

/**
 * Step 2: 查看该内容是否已经被打赏过
 */
const isContentTappedStep = new Step({
    id: 'is-content-tapped',
    description: '查看该内容是否已经被打赏过',
    outputSchema: z.object({
        isContentTapped: z.boolean().describe('是否已经被打赏过'),
    }),
    execute: async ({ context }) => {
        const response = await tappingAgent.generate(
            `请判断以下内容是否已经被打赏过，请用"是"或"否"回答：${context.triggerData.content}`
        );
        return {
            isContentTapped: response.text === '是',
        }
    },
});

/**
 * Step 3: 检查是否获知用户接收打赏的地址
 */
const checkReceiverAddressStep = new Step({
    id: 'check-receiver-address',
    description: '检查是否获知用户接收打赏的地址',
    outputSchema: z.object({
        isExistAddress: z.boolean().describe("是否获知用户接收打赏的地址"),
    }),
    execute: async ({ context }) => {
        const response = await tappingAgent.generate(
            `请问 Agent 是否知道当前内容的用户接收打赏的地址，明确具体回答，不要想象杜撰，请用"是"或"否"回答：${context.triggerData.content}`
        );
        return {
            isExistAddress: response.text === '是',
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
    execute: async ({ context, mastra }) => {
        const response = await tappingAgent.generate(
            `请获取以下内容的用户接收打赏的地址：${context.triggerData.content}`
        );

        return {
            receiverAddress: response.text,
        };
    },
});

/**
 * Step : 发送评论，获取打赏地址
 */
const sendCommentStep = new Step({
    id: 'send-comment',
    description: '发送评论，获取打赏地址',
    execute: async ({ context, mastra }) => {

    },
});

/**
 * Step last: 打赏
 */
const tappingStep = new Step({
    id: 'tapping',
    description: '打赏',
    execute: async ({ context, mastra }) => {
        const { receiverAddress } = context.getStepResult<{ receiverAddress: string }>('get-receiver-address');
        const { isExistAddress } = context.getStepResult<{ isExistAddress: boolean }>('check-receiver-address');
        if (isExistAddress) {
            // await mastra.tapping(receiverAddress, context.triggerData.content);
        }
    },
});


export const tappingWorkflow = new Workflow({
    name: 'tapping',
    triggerSchema: z.object({
        content: z.string().describe('用户输入的内容'),
    }),
})
    .step(isGoodContentStep)
    .then(isContentTappedStep)
    .then(checkReceiverAddressStep, {
        when: async ({ context }) => {
            const { isGoodContent } = context.getStepResult<{ isGoodContent: boolean }>('is-good-content');
            const { isContentTapped } = context.getStepResult<{ isContentTapped: boolean }>('is-content-tapped');
            return isGoodContent && !isContentTapped;
        },
    })
    .then(sendCommentStep)
    .until(async ({ context }) => {
        const result = context.getStepResult('check-receiver-address');
        return result && 'isExistAddress' in result ? result.isExistAddress : false;
    }, getReceiverAddressStep)
    .then(tappingStep)
    .commit();
