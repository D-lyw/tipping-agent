import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { convertNostrPubkeyToCkbAddress } from '../../lib/nostrMonitor';

/**
 * 将 Nostr 公钥转换为 CKB 地址的工具
 * 
 * 该工具允许 AI Agent 将 Nostr 平台的公钥转换为 CKB 区块链上的地址，
 * 方便在 Nostr 和 CKB 生态系统之间进行交互
 */
export const convertNostrPubkeyToCkbAddressTool = createTool({
  id: 'convert-nostr-pubkey-to-ckb-address',
  description: '将 Nostr 公钥转换为 CKB 地址',
  inputSchema: z.object({
    nostrPubkey: z.string().describe('Nostr 公钥（十六进制字符串）'),
  }),
  outputSchema: z.object({
    ckbAddress: z.string().describe('生成的 CKB 地址'),
  }),
  execute: async ({ context }) => {
    try {
      const { nostrPubkey } = context;
      const ckbAddress = await convertNostrPubkeyToCkbAddress(nostrPubkey);
      return { ckbAddress };
    } catch (error) {
      console.error('转换 Nostr 公钥到 CKB 地址失败:', error);
      throw error;
    }
  },
});

/**
 * 所有 Nostr 相关工具的集合
 */
export const nostrTools = {
  convertNostrPubkeyToCkbAddress: convertNostrPubkeyToCkbAddressTool,
}; 