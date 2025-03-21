# CKB 文档问答 Discord Bot

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yourusername/tapping-agent)

这是一个基于 Discord 的 Bot，用于回答与 Nervos CKB 区块链相关的技术问题。Bot 使用检索增强生成 (RAG) 技术结合大型语言模型来提供准确、相关的回答。

## 功能特点

- 基于 RAG 技术，从 CKB 技术文档中检索相关内容
- 使用高级语言模型，确保回答质量和准确性
- 支持中英文问答，默认使用中文回复
- 自动分割长消息以符合 Discord 消息长度限制
- 可配置的命令前缀和允许的频道
- 优雅的错误处理和恢复机制
- 支持多种命令：帮助、刷新文档、清除历史等
- 整合了Nostr监控服务，可以同时运行多个服务
- 支持Nostr消息转发功能，可以实现自动或手动转发有价值的内容

## 安装

1. 克隆仓库：

```bash
git clone https://github.com/YourUsername/ckb-doc-qa-bot.git
cd ckb-doc-qa-bot
```

2. 安装依赖：

```bash
npm install
# 或
yarn install
```

3. 设置环境变量：

在项目根目录创建 `.env` 文件，并添加以下配置：

```
# Discord Bot 基本配置
DISCORD_BOT_TOKEN=your_discord_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
BOT_PREFIX=!ckb
ALLOWED_CHANNEL_IDS=channel_id_1,channel_id_2

# Nostr 配置
NOSTR_PRIVATE_KEY=your_nostr_private_key_here
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.nostr.band

# 服务启用配置
ENABLE_CKB_BOT=true
ENABLE_NOSTR=true
```

> 注意：更多详细的配置选项请参考 `.env.example` 文件。

## 创建 Discord Bot

1. 前往 [Discord Developer Portal](https://discord.com/developers/applications)
2. 点击 "New Application"，创建一个新应用
3. 在 "Bot" 选项卡中，点击 "Add Bot"
4. 开启 "Message Content Intent" 选项
5. 复制 Bot 令牌填入 `.env` 文件
6. 在 "OAuth2" > "URL Generator" 中，选择 `bot` 和相关权限
7. 使用生成的 URL 将机器人添加到您的服务器

## 使用方法

### 启动服务

项目支持多种启动方式，可以启动单个服务或同时启动多个服务：

1. 启动所有服务（CKB文档Bot和Nostr监控）：

```bash
npm run all
# 或
yarn all
```

2. 只启动CKB文档问答Discord Bot：

```bash
npm run ckb:discord-bot
# 或
yarn ckb:discord-bot
```

3. 只启动Nostr监控服务：

```bash
# 启动完整Nostr监控
npm run nostr
# 或
yarn nostr

# 只监控历史内容
npm run nostr:historical
# 或
yarn nostr:historical

# 只启动实时监控
npm run nostr:realtime
# 或
yarn nostr:realtime
```

4. 强制刷新文档缓存启动：

```bash
npm run all -- --refresh
# 或
yarn all --refresh
```

### 与Discord Bot交互

在 Discord 服务器中，使用以下命令与 Bot 交互：

```
!ckb CKB的共识机制是什么?
```

您也可以通过直接在消息中提及 Bot 或通过私信与 Bot 交互。

### 可用命令

- `!ckb help` - 显示帮助信息
- `!ckb refresh` - 刷新文档缓存
- `!ckb info` - 显示Bot信息
- `!ckb clear` - 清除对话历史

## 本地测试

使用命令行测试 Bot 的问答功能：

```bash
# 运行标准测试
npm run test
# 或
yarn test

# 使用简单模式（无CKB专业知识）
npm run test:simple
# 或
yarn test:simple

# 显示详细调试信息
npm run test:verbose
# 或
yarn test:verbose

# 使用原始测试脚本
npm run test:direct
# 或
yarn test:direct

# 测试 Nostr 转发功能
npm run test:nostr-retweet
# 或
yarn test:nostr-retweet "事件ID" "可选的转发评论"

# 强制刷新文档缓存
npm run test -- --refresh
```

## 使用测试脚本

如果你只是希望测试CKB文档智能体的功能，可以使用我们提供的测试脚本：

```bash
# 使用增强版测试脚本
## 直接提供问题
node test/ckb-test.js "你的问题"

## 或者进入交互模式
node test/ckb-test.js

## 使用通用助手模式（无CKB专业知识）
node test/ckb-test.js --simple "你的问题"

## 显示详细的调试信息
node test/ckb-test.js --verbose "你的问题"

## 组合使用选项
node test/ckb-test.js --simple --verbose "你的问题"

# 使用原始测试脚本
node test/direct-test.js "你的问题"

# 测试 Nostr 转发功能
node test/test-nostr-retweet.js "事件ID" "可选的转发评论"
```

在交互模式中，你可以：
- 输入 `exit` 退出程序
- 输入 `clear` 清除对话历史

## 配置说明

您可以通过环境变量控制各个服务的启用状态：

- `ENABLE_CKB_BOT=true|false` - 控制是否启用CKB文档问答Discord Bot
- `ENABLE_NOSTR=true|false` - 控制是否启用Nostr监控服务

## 开发指南

- `src/index.ts` - 应用主入口，可启动所有服务
- `src/services/ckbDocBot.ts` - 单独启动CKB文档问答Discord Bot的入口
- `src/services/nostrMonitoring.ts` - 单独启动Nostr监控服务的入口
- `src/agents/ckbDocAgent.ts` - CKB 文档智能体实现
- `src/lib/ckbDocuments.ts` - 文档检索与处理逻辑
- `test/direct-test.js` - 原始命令行测试脚本
- `test/ckb-test.js` - CKB 文档助手测试脚本
- `test/test-nostr-retweet.js` - Nostr 转发功能测试脚本
- `src/lib/nostrEcosystemMonitor.ts` - Nostr生态监控实现
- `src/lib/nostrMonitor.ts` - Nostr客户端实现（包含转发功能）
- `src/lib/nostrContentFetcher.ts` - Nostr内容获取工具

## 项目结构

```
src/
├── index.ts                    # 主入口文件，可启动所有服务
├── services/                   # 各种服务的入口文件
│   ├── ckbDocBot.ts            # CKB文档问答Discord Bot服务入口
│   └── nostrMonitoring.ts      # Nostr监控服务入口
├── agents/                     # 智能体实现
│   └── ckbDocAgent.ts          # CKB文档智能体
├── lib/                        # 库文件
│   ├── ckbDocuments.ts         # CKB文档处理
│   ├── discordBot.ts           # Discord Bot实现
│   ├── nostrEcosystemMonitor.ts# Nostr生态监控
│   ├── nostrMonitor.ts         # Nostr客户端（包含转发功能）
│   └── nostrContentFetcher.ts  # Nostr内容检索
test/
├── ckb-test.js                 # CKB文档助手测试脚本
├── direct-test.js              # 原始命令行测试脚本
└── test-nostr-retweet.js       # Nostr 转发功能测试脚本
```

## 部署

推荐使用 Docker 部署：

```bash
# 构建 Docker 镜像
docker build -t ckb-doc-qa-bot .

# 运行容器
docker run -d --env-file .env --name ckb-bot ckb-doc-qa-bot
```

或者使用 PM2 在服务器上部署：

```bash
npm install -g pm2
pm2 start dist/index.js --name ckb-doc-bot
```

## 定制化

### 添加自定义文档

您可以通过编程方式添加自定义文档：

```typescript
import { addCustomDocument } from './src/lib/ckbDocuments';

// 添加自定义文档
addCustomDocument(
  '这是一段关于CKB的自定义文档内容...',
  '自定义文档标题',
  '内部文档'
);
```

### 修改相似度计算

默认情况下，系统使用 Jaccard 系数计算文档与查询的相似度。您可以在 `src/agents/ckbDocAgent.ts` 中修改 `calculateSimilarity` 函数来使用其他算法。

## 贡献

欢迎提交 Pull Requests 和 Issues！

## 许可证

MIT

## 项目介绍

Tapping Agent 是一个专注于 Nostr 平台内容监控、评估与互动的智能代理。它能够自动监测 Nostr 平台上的内容，对高质量内容进行打赏，并可以选择性地转发值得分享的帖子。

## 主要功能

- **Nostr 内容监控**：实时监控 Nostr 平台的内容发布
- **内容价值评估**：使用 AI 自动评估内容的价值和相关性
- **自动打赏**：对高质量内容进行自动 CKB 打赏
- **内容转发**：转发高质量的 Nostr 内容
- **CKB 文档问答**：提供基于 CKB 文档的智能问答服务

## 部署指南

项目支持多种部署方式，包括：

- [本地开发环境](#本地开发)
- [Vercel 部署](./VERCEL.md)
- [Render 部署](#render-部署)

### Render 部署

点击上方 "Deploy to Render" 按钮，或按照以下步骤手动部署：

1. 在 Render 仪表板中，点击 "New +" 并选择 "Web Service"
2. 连接您的 GitHub 仓库
3. 设置以下配置：
   - Name: tapping-agent (或您喜欢的名称)
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/index.js`
4. 添加环境变量（在 "Environment" 部分）：
   - OPENAI_API_KEY
   - NOSTR_PRIVATE_KEY
   - DISCORD_BOT_TOKEN (如果使用 Discord 功能)
   - 其他必要的环境变量
5. 点击 "Create Web Service" 按钮

更多详细信息，请参阅 [RENDER.md](./RENDER.md) 文档。

## 本地开发

```bash
# 安装依赖
npm install

# 编译项目
npm run build

# 启动服务
npm start

# 仅启动 Nostr 监控服务
npm run nostr
```