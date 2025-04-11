# CKB生态文档处理模块

该模块负责抓取、处理和管理CKB生态系统的技术文档，为RAG（检索增强生成）系统提供支持。

## 架构设计

模块采用模块化架构设计，将功能划分为多个子模块：

```
src/documents/
├── core/           # 核心类型和管理器
│   ├── types.ts    # 共享类型定义
│   ├── config.ts   # 配置管理
│   ├── manager.ts  # 文档管理器
│   └── processor.ts # 文档处理协调器
├── scrapers/       # 数据抓取器
│   ├── website.ts  # 网站抓取
│   ├── github.ts   # GitHub仓库抓取
│   └── file.ts     # 本地文件处理
├── processors/     # 数据处理器
│   └── chunker.ts  # 文档分块处理
├── storage/        # 存储管理
│   └── vector-store.ts # 向量存储
├── utils/          # 工具函数
│   ├── logger.ts   # 日志系统
│   ├── errors.ts   # 错误处理
│   ├── helpers.ts  # 通用辅助函数
│   └── network.ts  # 网络请求工具
└── index.ts        # 主入口点
```

## 主要功能

### 多源数据抓取

- **网站抓取**：支持抓取静态网站内容，包括传统的Axios+Cheerio抓取和基于Firecrawl的增强抓取。
- **GitHub抓取**：支持抓取GitHub仓库的文档、代码和注释。
- **本地文件处理**：支持处理本地文件和目录。

### 智能文档处理

- **文档分块**：智能将长文档分割成合适大小的块。`chunker.ts` 文件实现了智能文档分块功能，根据文档结构和内容特性自动分块，支持保留标题和代码块、按段落分割等多种选项。
- **块优化**：合并过小的块、去除重复内容。`chunker.ts` 文件还提供了优化文档块的功能，处理重叠内容、合并过小的块、确保上下文的连贯性。
- **内容提取**：从各种格式中提取有意义的内容。

### 向量存储

- **文档向量化**：将文档转换为向量表示。
- **向量索引**：支持高效的相似度搜索。
- **向量检索**：基于语义查询文档。

### 流式处理支持

- **文档处理协调器**：`processor.ts` 文件负责协调文档的爬取、向量化和存储的流式处理流程。它支持批处理和内存管理策略，确保高效处理大规模文档数据。

### 错误处理与日志

- **统一错误处理**：定义一套统一的错误类型和处理策略。
- **结构化日志**：提供详细且结构化的日志记录。
- **可追踪性**：每个操作都有明确的日志，便于问题诊断。

## 使用示例

### 初始化文档管理器

```typescript
import { createDocumentManager } from './documents';

// 创建文档管理器实例
const documentManager = createDocumentManager({
  enableCache: true,
  autoOptimizeChunks: true
});

// 初始化
await documentManager.initialize();
```

### 抓取文档

```typescript
// 抓取所有启用的文档源
const results = await documentManager.fetchAllSources();

// 或者抓取单个文档源
const source = {
  name: 'CKB文档',
  url: 'https://docs.nervos.org',
  type: 'website' as const,
  selector: 'article',
  enabled: true
};

const result = await documentManager.fetchSingleSource(source);
```

### 处理本地文档

```typescript
// 处理本地文档目录
const chunks = await documentManager.addLocalDirectory('./docs', 'Local Docs');
```

### 获取文档

```typescript
// 获取所有文档块
const allChunks = documentManager.getAllDocumentChunks();

// 获取特定来源的文档块
const ckbDocs = documentManager.getDocumentChunksBySource('Nervos CKB 文档');

// 获取特定类型的文档块
const githubDocs = documentManager.getDocumentChunksBySourceType('github');
```

### 向量存储与检索

```typescript
import { 
  MastraVectorStore,
  queryDocuments,
  formatQueryResults
} from './documents';

// 方法1：使用向量存储类
const vectorStore = new MastraVectorStore({
  apiKey: process.env.OPENAI_API_KEY,
  pgConnectionString: process.env.PG_CONNECTION_STRING
});

// 初始化
await vectorStore.initialize();

// 存储文档
const chunks = documentManager.getAllDocumentChunks();
await vectorStore.storeDocuments(chunks);

// 查询文档
const results = await vectorStore.queryByText('CKB共识机制是如何工作的?', {
  maxResults: 5,
  similarityThreshold: 0.75
});

// 方法2：使用RAG接口（更简单）
// 索引所有文档
await indexAllDocuments();

// 查询文档
const results = await queryDocuments('CKB共识机制是如何工作的?', 5);

// 格式化结果
console.log(formatQueryResults(results));
// 或使用Markdown格式
console.log(formatQueryResultsMarkdown(results));
```

### RAG系统命令行工具

文档模块提供了命令行工具，用于快速测试和使用RAG系统：

```bash
# 索引所有文档
node -r ts-node/register src/documents/rag/main.ts index

# 执行查询
node -r ts-node/register src/documents/rag/main.ts query "CKB共识机制" 3

# 使用Markdown格式输出
node -r ts-node/register src/documents/rag/main.ts query "Nervos DAO" --markdown
```

## 配置选项

配置在 `src/documents/core/config.ts` 中定义，包括：

- **GitHub API配置**：API令牌、重试策略等。
- **Firecrawl API配置**：API密钥和端点。
- **网络请求配置**：超时、重定向等。
- **文档处理配置**：分块大小、最小块长度等。
- **数据源配置**：预定义的CKB文档源列表。

## 错误处理

模块提供了统一的错误处理机制，所有错误都继承自 `DocumentProcessingError` 类：

```typescript
import { safeExecute, handleError } from './documents';

// 安全执行操作
const result = await safeExecute(
  async () => {
    // 可能抛出错误的操作
    return await riskyOperation();
  },
  (error) => {
    // 错误处理逻辑
    console.error('操作失败:', error);
    return fallbackValue;
  }
);
```

## 日志系统

模块提供了结构化的日志系统，支持详细的操作记录和问题追踪。

## 扩展性

该模块设计为可扩展的，您可以：

1. 添加新的文档源
2. 实现新的文档抓取器
3. 扩展文档处理逻辑
4. 添加不同的存储后端
