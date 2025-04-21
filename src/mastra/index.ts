import { Mastra } from '@mastra/core';
import { createLogger } from '@mastra/core/logger';
import { tappingAgent } from './agents/index';
// import { xAgent } from './agents/xAgent.js';
import { ckbDocAgent } from './agents/ckbDocAgent';
// import { xWorkflow } from './workflows/x.js';
import {
  ckbWorkflow,
  nostrContentTappingWorkflow
} from './workflows/index';
import { PgVector } from '@mastra/pg';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 构建带有连接超时参数的连接字符串
const connectionString = `${process.env.POSTGRES_CONNECTION_STRING || ''}?connect_timeout=30&statement_timeout=60000&idle_timeout=60000`;

// 初始化 PgVector 向量存储
const pgVector = new PgVector(connectionString);

// 使用最简单的配置
export const mastra = new Mastra({
  workflows: {
    ckbWorkflow,
    nostrContentTappingWorkflow
  },
  agents: {
    tappingAgent,
    ckbDocAgent
  },
  vectors: {
    pgVector
  },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  // telemetry: {
  //   serviceName: "nervepuppy",
  //   enabled: true,
  //   export: {
  //     type: "otlp",
  //   },
  // },
});