import express from 'express';
import { healthCheck } from './health';

const router = express.Router();

// 健康检查路由
router.get('/health', healthCheck);

export default router; 