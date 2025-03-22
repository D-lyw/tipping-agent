<div align="center">
  <img src="https://s21.ax1x.com/2025/03/21/pE0pABT.png" alt="神经二狗 Logo">
  <h1>神经二狗</h1>
</div>

一个为 CKB 社区而生的智能体集合，致力于为社区带来更多的趣味、温暖和效用。

我们利用 AI 的能力，借鉴 meme 生态 IP 概念，设计并构建了一个神经二狗的 IP 形象，赋予它趣味性和实用性，为 CKB 社区生态带来一点有趣的东西。

JUST FOR FUN，我们的目标是让神经二狗从南塘出发，出道 CKB 社区。

## 系统核心架构

### 基础框架设计

"神经二狗"基于 Mastra 智能体框架构建，采用模块化设计，核心组件包括：

**1. Mastra 工作流引擎：**

- 定义了完整的工作流程序，包括内容检测、评估、打赏和互动等步骤
- 基于事件驱动的步骤链，确保每一步都有明确的输入和输出
- 支持条件分支和错误处理，提高系统稳定性

**2. AI 驱动的判断模块：**

- 利用 GPT-4o 模型进行内容质量评估
- 通过精心设计的提示词指导 AI 识别值得打赏的优质 CKB 社区内容
- 智能过滤垃圾信息和低质量内容

**3. 区块链交互层：**

- 与 CKB 测试网/主网的无缝集成
- 支持地址生成、余额查询、交易构建和发送
- 基于 @ckb-ccc/core 库实现安全可靠的交易

**4. 使用 RAG 技术实现的 CKB 文档 Agent：**

- 通过 RAG 技术，实现了一个可以在 Discord 集成的 CKB 文档 Agent
- 该 Agent 可以回答关于 CKB 文档和社区的问题

**5. 社交媒体集成：**

- Nostr 平台内容监控和互动
- 支持实时内容检索和历史内容搜索
- 评论、回复和转发功能，增强社区互动

### 技术亮点

- 基于 Mastra 框架构建的工作流系统
- AI 驱动的内容质量评估
- 与 CKB 区块链的无缝集成
- 多平台社交媒体集成 (Nostr, 更多平台开发中)
- 可扩展的模块化设计

## 技术架构

### 系统结构

```
tapping-agent/
├── src/
│   ├── mastra/       # Mastra 工作流引擎
│   │   ├── agents/   # AI 代理定义
│   │   ├── tools/    # 工具集成
│   │   └── workflows/ # 工作流定义
│   ├── lib/          # 核心功能库
│   ├── services/     # 服务实现
│   └── routes/       # API 路由
├── data/             # 数据存储目录
│   └── tapped-content.json  # 已打赏记录
└── ...
```

### 工作流程

1. **内容监控**：监听 Nostr 平台上的 CKB 相关内容
2. **智能评估**：使用 AI 判断内容是否为高质量且值得打赏
3. **查重检查**：通过 JSON 文件检查内容是否已被打赏过
4. **打赏流程**：获取创作者 CKB 地址，自动执行打赏转账
5. **社交互动**：发送评论通知创作者，并转发有价值的内容

## 安装指南

### 环境要求

- Node.js >= 18.x
- TypeScript >= 5.x
- OpenAI API 密钥

### 安装步骤

1. 克隆仓库

```bash
git clone https://github.com/your-repo/tapping-agent.git
cd tapping-agent
```

2. 安装依赖

```bash
npm install
# 或
yarn install
```

3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置信息
```

4. 编译项目

```bash
npm run build
# 或
yarn build
```

## 使用指南

### 启动服务

```bash
# 启动完整服务
npm run all
# 或
yarn all

# 仅启动 Nostr 监控（实时模式）
npm run nostr:realtime
# 或
yarn nostr:realtime
```

### 配置选项

主要配置选项在 `.env` 文件中，包括：

- `OPENAI_API_KEY`: OpenAI API 密钥
- `CKB_PRIVATE_KEY`: 打赏用的 CKB 发送方私钥
- `NOSTR_PRIVATE_KEY`: Nostr 私钥（用于发送评论和转发）
- `DISCORD_BOT_TOKEN`: Discord bot token

### 尚存问题

- 快速多次 CKB 转账交易仍会执行报错

## 后续改进方向

**1. 增强重复检测机制：**

目前的重复检测机制基于简单的 ID 匹配，可以改进为更复杂的内容相似度检测。

**2. 优化打赏金额策略：**

实现基于内容质量的动态打赏金额，更好地激励优质创作。

**3. 多平台支持：**

扩展到 X、Reddit 等更多社交媒体平台，扩大影响范围。增加在 Discord 社区中主动性回复的能力，增强其趣味性和工具性能力

**4. 改进内容评估 Prompt：**

进一步优化 AI 提示词，提高内容评估的准确性和效率。

**5. 社区参与机制：**

增加让社区成员参与内容推荐和评价的机制，实现更加去中心化的内容发现。

**6. 对话交互能力：**

增强智能体与用户的对话能力，实现更加自然和有趣的互动体验。

**7. 数据分析和报告：**

增加数据分析功能，生成社区内容趋势和热点的定期报告。

**8. MCP 功能集成**

添加 MCP Server 能力，赋予神经二狗同其他社区 AI Agent 沟通交流的能力。

## 许可证

本项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件
