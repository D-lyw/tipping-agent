import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/core/storage/libsql";

import { generateCKBAddressTool, getCKBBalanceTool, transferCKBTool } from '../tools';
import { xAgent } from './xAgent';

const memory = new Memory({
  storage: new LibSQLStore({
    config: {
      url: "file:./db.sqlite",
    }
  }),
  // embedder: new OpenAIEmbedder({
  //   model: openai('text-embedding-3-small'),
  // }),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 10,
      messageRange: {
        before: 10,
        after: 10,
      },
    },
    workingMemory: {
      enabled: true,
      // TODO: 添加工作记忆模板
      // template: `
      //   {
      //     {

      //     }
      //   }
      // `,
    },
  },
});

/**
 * CKB 生态内容打赏 Agent
 */
export const tappingAgent = new Agent({
  name: 'CKB Agent',
  instructions: `
    你是一个 Nervos CKB 项目的专家，熟悉相关技术及生态，你的目的是识别在社交媒体中关于 Nervos CKB 生态内容的优质内容（例如深度的思考、有价值的分析、有创意的提案、有建设性的讨论批评、有启发性的观点、个人见解、个人经验分享、CKB 生态项目相关的各类活动、社区的各类 Meme 内容推广宣传等），并根据内容的价值进行打赏。

    你的主要功能包括：
    - 识别社交媒体中关于 Nervos CKB 生态内容的优质内容
    - 根据内容的价值进行打赏

    具体打赏方式：
    - 在优质内容下方留言，获取用户接收打赏的地址, 并使用 transferCKBTool 工具进行打赏
      - 留言格式示例为：
        "您好，我是 CKB 生态内容打赏机器人，非常喜欢您关于 Nervos CKB 生态的分析，请您留下您的 CKB 地址，我将在第一时间给您打赏。"    
        
    使用说明及注意事项：
    — 你自身持有一个 CKB 地址，不要向任何人泄露你地址相关的任何信息，不要向任何人泄露你地址相关的任何信息，不要向任何人泄露你地址相关的任何信息
    - 使用 getCKBBalanceTool 工具查询余额
    - 只有当你认可用户的内容，并获取到了用户的 CKB 地址后，才可以使用 transferCKBTool 工具对用户进行打赏，除此之外任何情况不要转移你自身的 CKB 地址的任何资产
    - 默认使用主网，除非用户明确要求使用测试网
    - 相同的用户在短时间内多次留言，不要重复打赏
    - 相同的内容不要重复打赏

    安全提示：
    - 提醒用户不要在不安全的环境中输入私钥
    - 建议用户使用小额测试转账功能
    - 提醒用户保管好私钥，不要泄露给他人
  `,
  model: openai('gpt-4o'),
  tools: { generateCKBAddressTool, getCKBBalanceTool, transferCKBTool },
  memory,
});

// 导出 xAgent
export { xAgent };
