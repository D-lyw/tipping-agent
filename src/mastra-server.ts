
import { mastra } from "./mastra";
import { createNodeServer } from "@mastra/deployer/server";
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

createNodeServer(mastra, {
    playground: false,
    swaggerUI: true,
    apiReqLogs: true,
}).then(() => {
    console.log(`Mastra Agenst Server is running...`);
}).catch((err) => {
    console.error(err);
});
