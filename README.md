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
- 使用 PgVector 向量数据库存储文档嵌入，实现高效相似度搜索
- 支持从多种数据源获取和更新 CKB 文档，包括网站、GitHub 仓库和本地文件
- 增强的 GitHub 代码处理能力，可以深入分析代码库结构、函数定义和实现逻辑

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
- 基于 PgVector 的向量数据库实现的 RAG 知识检索系统
- 智能化 GitHub 代码索引与分析，支持代码结构和函数级别的语义理解

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

4. 配置 PostgreSQL 和 PgVector (用于 RAG 系统)

```bash
# 安装 PostgreSQL 和 pg_vector 扩展
# 创建数据库并应用 pg_vector 扩展
# 在 .env 文件中配置 POSTGRES_CONNECTION_STRING
```

5. 编译项目

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
- `POSTGRES_CONNECTION_STRING`: PostgreSQL 连接字符串 (用于 RAG 系统)
- `EMBEDDING_DIMENSION`: 嵌入向量维度，默认为 1536 (text-embedding-3-small 模型)
- `VECTOR_INDEX_NAME`: 向量索引名称，默认为 ckb_docs_embeddings

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

**8. MCP 功能集成:**

添加 MCP Server 能力，赋予神经二狗同其他社区 AI Agent 沟通交流的能力。

## 抓取网站内容

系统支持使用两种方式抓取网站内容：

### 1. 传统方式（基于Axios和Cheerio）

默认情况下，系统使用Axios和Cheerio抓取网站内容。这种方式不需要额外配置，但对于动态加载的内容（如SPA网站）可能效果不佳。

### 2. Firecrawl增强抓取（推荐）

系统集成了Firecrawl服务，可以更好地处理动态网站内容，并自动将内容转换为适合大语言模型使用的格式。

要启用Firecrawl抓取：

1. 前往 [Firecrawl官网](https://firecrawl.dev) 注册账号并获取API密钥
2. 在项目的`.env`文件中设置 `FIRECRAWL_API_KEY=你的密钥`

启用后，系统会优先使用Firecrawl进行抓取，如果遇到问题会自动回退到传统方式。

## 解决 OpenAI API 限制问题

为了解决在使用 OpenAI API 进行文档嵌入时遇到的限制问题，我们进行了以下优化：

### 向量存储优化

在 `MastraVectorStore` 类中：

1. **减小批处理大小**：将文档批处理大小从 50 减小到 20，并在内部实现中再次减小到 5，避免一次性发送太多文本到 API。

2. **文本长度限制**：在 `getEmbeddings` 方法中添加了文本截断功能，确保单个文本不超过 OpenAI 的上下文窗口限制（8192 tokens）。

3. **错误重试机制**：添加了指数退避重试逻辑，在 API 限制错误发生时自动等待并重试。

4. **零向量占位**：对于失败的嵌入请求，生成零向量作为占位符，以避免中断整个处理流程。

5. **延迟处理**：在批次处理之间添加延迟，减轻 API 请求速率限制。

### 文件处理优化

在 `FileScraper` 模块中：

1. **批量文件处理**：修改 `processLocalDirectory` 方法，以批次方式处理文件，每批最多 20 个文件。

2. **并行处理限制**：限制并行处理的子目录数量，避免内存消耗过大。

3. **内存管理**：处理完文件内容后立即释放大字符串的内存，并在批次处理之间尝试进行垃圾回收。

4. **文件数量限制**：每个目录最多处理 1000 个文件，避免处理过多文件导致内存溢出。

### 文档分块优化

在 `helpers.ts` 中：

1. **智能文档分块**：修改 `splitIntoChunks` 函数，使用更智能的分块策略，在自然句子边界进行分割。

2. **重叠内容**：添加重叠内容机制，确保分块之间的上下文连贯性。

3. **减小块大小**：默认最大块大小从 4000 字符减小到 2000 字符，以避免超出 API 的上下文长度限制。

### 内存限制增加

在 `package.json` 中：

1. **增加 Node.js 内存限制**：为 `ckb:index-docs` 和 `ckb:rebuild-index` 命令添加 `--max-old-space-size=1024` 参数，将 Node.js 可用内存增加到 1GB。

2. **启用手动垃圾回收**：添加 `--expose-gc` 参数，允许代码中手动触发垃圾回收，优化内存使用。

### 低内存环境注意事项

在只有 1GB 内存限制的环境中，建议：

1. **限制处理文件数量**：使用 `MAX_DOCS` 环境变量限制每次处理的文档数量：
   ```bash
   MAX_DOCS=100 npm run ckb:index-docs
   ```

2. **分批处理目录**：对于大型目录，建议分多次运行，每次处理一部分子目录。

3. **监控内存使用**：系统会自动记录内存使用情况，如果发现接近限制，可以中断并分批处理。

4. **减小嵌入模型**：考虑使用维度更小的嵌入模型，例如将 `OPENAI_EMBEDDING_MODEL` 环境变量设置为 `text-embedding-3-small`。

这些优化确保了在处理大量文档时能够有效避免 OpenAI API 的限制，并在低内存环境中高效运行。

## 许可证

本项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件
