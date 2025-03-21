import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { 
  generateCkbAddress,
  transferCKB, 
  getCKBBalance, 
  NETWORK_MAINNET,
  NETWORK_TESTNET,
  CKB_NETWORK
} from '../../lib/ckb';

// 环境变量 - 仅保留默认打赏金额
const defaultTipAmount = Number(process.env.DEFAULT_TIPPING_AMOUNT || 100);

/**
 * 生成 CKB 地址工具
 */
export const generateCKBAddressTool = createTool({
  id: 'generate-ckb-address',
  description: '生成 CKB 地址',
  inputSchema: z.object({
    network: z.enum([NETWORK_MAINNET, NETWORK_TESTNET])
      .optional()
      .describe('网络类型，默认使用环境变量中配置的网络'),
  }),
  outputSchema: z.object({
    address: z.string().describe('生成的 CKB 地址'),
    network: z.string().describe('网络类型'),
  }),
  execute: async ({ context }) => {
    const network = context.network || CKB_NETWORK;
    const address = await generateCkbAddress(network);
    return { 
      address,
      network
    };
  },
});

/**
 * 查询 CKB 余额工具
 */
export const getCKBBalanceTool = createTool({
  id: 'get-ckb-balance',
  description: '获取 CKB 地址余额',
  inputSchema: z.object({
    address: z.string().describe('CKB 地址'),
    network: z.enum([NETWORK_MAINNET, NETWORK_TESTNET])
      .optional()
      .describe('网络类型，默认使用环境变量中配置的网络'),
  }),
  outputSchema: z.object({
    balance: z.string().describe('CKB 余额（Shannon 单位）'),
    balanceCKB: z.number().describe('CKB 余额（CKB 单位）'),
    network: z.string().describe('网络类型'),
  }),
  execute: async ({ context }) => {
    const { address } = context;
    const network = context.network || CKB_NETWORK;
    
    const balance = await getCKBBalance(address, network);
    const balanceCKB = Number(balance) / 10 ** 8; // 转换为 CKB 单位（1 CKB = 10^8 Shannon）

    return {
      balance: balance.toString(),
      balanceCKB,
      network
    };
  },
});

/**
 * 转账 CKB 工具
 */
export const transferCKBTool = createTool({
  id: 'transfer-ckb',
  description: '转账 CKB 到指定地址',
  inputSchema: z.object({
    toAddress: z.string().describe('接收方地址'),
    amount: z.number()
      .positive()
      .default(defaultTipAmount)
      .describe(`转账金额（CKB单位），默认 ${defaultTipAmount}`),
    network: z.enum([NETWORK_MAINNET, NETWORK_TESTNET])
      .optional()
      .describe('网络类型，默认使用环境变量中配置的网络'),
  }),
  outputSchema: z.object({
    txHash: z.string().describe('交易哈希'),
    amount: z.number().describe('转账金额'),
    recipient: z.string().describe('接收方地址'),
    network: z.string().describe('网络类型'),
  }),
  execute: async ({ context }) => {
    const { toAddress, amount } = context;
    const network = context.network || CKB_NETWORK;
    
    console.log(`开始转账 ${amount} CKB 到地址: ${toAddress} (网络: ${network})`);
    const txHash = await transferCKB(toAddress, amount, network);
    console.log(`转账成功，交易哈希: ${txHash}，网络: ${network}`);
    
    return {
      txHash,
      amount,
      recipient: toAddress,
      network
    };
  },
}); 