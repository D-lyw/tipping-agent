import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { ckbWorkflow, tappingWorkflow, nostrContentTappingWorkflow } from './workflows/index.js';
import { tappingAgent } from './agents/index.js';
import { xAgent } from './agents/xAgent.js';
import { ckbDocAgent } from './agents/ckbDocAgent.js';
import { xWorkflow } from './workflows/x.js';
import { VercelDeployer } from '@mastra/deployer-vercel';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const vercelDeployer = new VercelDeployer({
  teamSlug: process.env.VERCEL_TEAM_SLUG ?? "",
  projectName: process.env.MASTRA_PROJECT_NAME ?? "",
  token: process.env.MASTRA_VERCEL_TOKEN ?? "",
});

// 使用最简单的配置
export const mastra = new Mastra({
  deployer: vercelDeployer as any,
  workflows: {
    ckbWorkflow: ckbWorkflow as any,
    // tappingWorkflow, 
    // xWorkflow, 
    nostrContentTappingWorkflow: nostrContentTappingWorkflow as any
  },
  agents: {
    tappingAgent,
    // xAgent,
    ckbDocAgent
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    serviceName: "nervepuppy",
    enabled: true,
    export: {
      type: "otlp",
    },
  },
});