import { Workflow } from '@mastra/core/workflows';
import { Step } from '@mastra/core/workflows';
import { z } from 'zod';
import { tappingAgent } from '../agents';
import { generateCkbAddress } from '../../lib/ckb';

/**
 * 初始化 CKB 钱包步骤 - 仅限系统内部使用，不对外暴露
 * 这个步骤会生成一个新的私钥并存储在系统中
 */
const initializeWalletStep = new Step({
  id: 'initialize-wallet',
  description: '初始化 CKB 钱包（系统内部使用）',
  inputSchema: z.object({}),
  execute: async ({ context, mastra }) => {
    // 使用环境变量中的私钥生成地址
    const address = await generateCkbAddress();

    return {
      address: address,
      isTestnet: true 
    };
  },
});

/**
 * CKB 余额查询步骤 - 可以对外暴露
 */
const getBalanceStep = new Step({
  id: 'get-balance',
  description: '查询 CKB 余额',
  inputSchema: z.object({
    address: z.string().optional().describe('CKB 地址（如不提供则查询 Agent 自身地址）'),
  }),
  execute: async ({ context, mastra }) => {
    const { address } = context.inputData;

    // 如果用户没有提供地址，则使用 Agent 自身的地址
    // 实际应用中，这里应该从安全存储中获取 Agent 的地址
    const queryAddress = address || 'Agent的地址'; // 实际应用中应替换为真实地址

    const response = await tappingAgent.generate(
      `请查询以下地址的 CKB 余额：${queryAddress} 使用环境变量中的网络。`
    );

    return {
      address: queryAddress,
      result: response.text,
    };
  },
});

/**
 * CKB 转账步骤 - 对外暴露但只允许从 Agent 地址转出
 */
const transferStep = new Step({
  id: 'transfer',
  description: '从 Agent 转账 CKB 到指定地址',
  inputSchema: z.object({
    toAddress: z.string().describe('接收方地址'),
    amount: z.number().positive().describe('转账金额（CKB单位）'),
  }),
  execute: async ({ context, mastra }) => {
    const { toAddress, amount } = context.inputData;

    const response = await tappingAgent.generate(
      `请将 ${amount} CKB 从 Agent 的私钥转账到地址 ${toAddress}， 使用环境变量中的网络。`
    );

    return {
      toAddress,
      amount,
      result: response.text,
    };
  },
});

/**
 * CKB 工作流
 */
export const ckbWorkflow = new Workflow({
  name: 'ckb-workflow',
  triggerSchema: z.object({
    action: z.enum(['get-balance', 'transfer']).describe('要执行的 CKB 操作'),
    address: z.string().optional().describe('CKB 地址（仅用于查询余额，如不提供则查询 Agent 自身地址）'),
    toAddress: z.string().optional().describe('接收方地址（仅用于转账）'),
    amount: z.number().positive().optional().describe('转账金额（仅用于转账）'),
  }),
})
  .step(getBalanceStep)
  .step(transferStep);

// // 系统初始化工作流 - 不对外暴露
// export const ckbInitWorkflow = new Workflow({
//   name: 'ckb-init-workflow',
//   triggerSchema: z.object({}),
// })
//   .step(initializeWalletStep);

ckbWorkflow.commit();
// ckbInitWorkflow.commit(); 