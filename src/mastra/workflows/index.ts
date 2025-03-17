import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
// import { weatherWorkflow } from './weather';
import { ckbWorkflow } from './ckb';
import { tappingWorkflow } from './tapping';
import { xWorkflow } from './x';

// 导出工作流
export { ckbWorkflow, tappingWorkflow, xWorkflow };
