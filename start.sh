#!/bin/bash

# 检查是否安装了 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未安装 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查是否安装了 npm
if ! command -v npm &> /dev/null; then
    echo "错误: 未安装 npm，请先安装 npm"
    exit 1
fi

# 检查是否存在 .env 文件
if [ ! -f .env ]; then
    echo "警告: 未找到 .env 文件，将从 .env.example 复制一份"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "已从 .env.example 创建 .env 文件，请编辑 .env 文件并填写正确的配置"
        exit 1
    else
        echo "错误: 未找到 .env.example 文件，无法创建 .env 文件"
        exit 1
    fi
fi

# 安装依赖
echo "正在安装依赖..."
npm install

# 编译 TypeScript
echo "正在编译 TypeScript..."
npm run build

# 启动应用
echo "正在启动 Tapping Agent 应用..."
node dist/index.js 