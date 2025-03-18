#!/bin/bash

# Nostr 监控启动脚本

echo "正在启动 Nostr 监控服务..."

# 检查环境变量文件
if [ ! -f .env ]; then
  echo "未找到 .env 文件，创建示例环境变量文件..."
  cp .env.example .env
  echo "请编辑 .env 文件，设置必要的环境变量后再次运行此脚本"
  exit 1
fi

# 运行 Nostr 监控应用
npm run nostr 