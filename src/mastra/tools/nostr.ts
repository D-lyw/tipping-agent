import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { convertNostrIdentifierToCkbAddress } from '../../lib/nostrMonitor';

/**
 * 将 Nostr 标识符转换为 CKB 地址的工具
 * 
 * 该工具允许 AI Agent 将 Nostr 平台的公钥或 NIP-19 格式标识符（如 npub1, nprofile1）
 * 转换为 CKB 区块链上的地址，方便在 Nostr 和 CKB 生态系统之间进行交互
 */
export const convertNostrIdentifierToCkbAddressTool = createTool({
  id: 'convert-nostr-identifier-to-ckb-address',
  description: '将 Nostr 公钥或 NIP-19 格式标识符（如 npub1, nprofile1）转换为 CKB 地址',
  inputSchema: z.object({
    nostrIdentifier: z.string().describe('Nostr 公钥（十六进制字符串）或 NIP-19 格式标识符（如 npub1, nprofile1）'),
  }),
  outputSchema: z.object({
    ckbAddress: z.string().describe('生成的 CKB 地址'),
  }),
  execute: async ({ context }) => {
    try {
      const { nostrIdentifier } = context;
      const ckbAddress = await convertNostrIdentifierToCkbAddress(nostrIdentifier);
      return { ckbAddress };
    } catch (error) {
      console.error('转换 Nostr 标识符到 CKB 地址失败:', error);
      throw error;
    }
  },
});

// 为向后兼容性保留旧的名称
export const convertNostrPubkeyToCkbAddressTool = convertNostrIdentifierToCkbAddressTool;

/**
 * 所有 Nostr 相关工具的集合
 */
export const nostrTools = {
  convertNostrIdentifierToCkbAddress: convertNostrIdentifierToCkbAddressTool,
  // 为向后兼容性保留旧的名称
  convertNostrPubkeyToCkbAddress: convertNostrIdentifierToCkbAddressTool,
}; 