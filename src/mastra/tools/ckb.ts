import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generateAddressByPrivateKey, transferCKB, getCKBBalance } from '../../lib/ckb';

/**
 * 生成 CKB 地址工具
 */
export const generateCKBAddressTool = createTool({
  id: 'generate-ckb-address',
  description: '根据私钥生成 CKB 地址',
  inputSchema: z.object({
    privateKey: z.string().describe('私钥（带或不带0x前缀）'),
    isTestnet: z.boolean().describe('是否使用测试网络，默认为 false（主网）'),
  }),
  outputSchema: z.object({
    address: z.string().describe('生成的 CKB 地址'),
  }),
  execute: async ({ context }) => {
    const { privateKey, isTestnet } = context;
    const address = await generateAddressByPrivateKey(privateKey, isTestnet);
    return { address };
  },
});

/**
 * 查询 CKB 余额工具
 */
export const getCKBBalanceTool = createTool({
  id: 'get-ckb-balance',
  description: '查询指定地址的 CKB 余额',
  inputSchema: z.object({
    address: z.string().describe('CKB 地址'),
    isTestnet: z.boolean().describe('是否使用测试网络，默认为 false（主网）'),
  }),
  outputSchema: z.object({
    balance: z.string().describe('CKB 余额'),
    formattedBalance: z.string().describe('格式化后的 CKB 余额'),
  }),
  execute: async ({ context }) => {
    const { address, isTestnet } = context;
    const balance = await getCKBBalance(address, isTestnet);
    
    // 将 Shannon 转换为 CKB（1 CKB = 10^8 Shannon）
    const ckbBalance = Number(balance) / 10**8;
    
    return { 
      balance: balance.toString(),
      formattedBalance: `${ckbBalance.toLocaleString()} CKB` 
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
    amount: z.number().positive().describe('转账金额（CKB单位）'),
    isTestnet: z.boolean().describe('是否使用测试网络，默认为 false（主网）'),
  }),
  outputSchema: z.object({
    txHash: z.string().describe('交易哈希'),
    amount: z.number().describe('转账金额'),
    toAddress: z.string().describe('接收方地址'),
    network: z.string().describe('网络类型'),
  }),
  execute: async ({ context }) => {
    const { toAddress, amount, isTestnet } = context;
    const txHash = await transferCKB(process.env.CKB_PRIVATE_KEY!, toAddress, amount, isTestnet);
    
    return {
      txHash,
      amount,
      toAddress,
      network: isTestnet ? '测试网' : '主网',
    };
  },
}); 