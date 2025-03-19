import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generateCKBAddressTool, getCKBBalanceTool, transferCKBTool } from './ckb';
import { xTools } from './x';
import { convertNostrPubkeyToCkbAddressTool, nostrTools } from './nostr';

// 导出 CKB 相关工具
export { generateCKBAddressTool, getCKBBalanceTool, transferCKBTool };

// 导出 X 相关工具
export { xTools };

// 导出 Nostr 相关工具
export { convertNostrPubkeyToCkbAddressTool, nostrTools };
