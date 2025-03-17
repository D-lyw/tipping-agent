import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { ckbWorkflow, tappingWorkflow } from './workflows';
import { tappingAgent } from './agents';
import { xAgent } from './agents/xAgent';
import { xWorkflow } from './workflows/x';

export const mastra = new Mastra({
  workflows: { ckbWorkflow, tappingWorkflow, xWorkflow },
  agents: { tappingAgent, xAgent },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
