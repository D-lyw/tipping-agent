# CKB 生态文档流式处理系统

这是一个针对CKB生态文档的高效流式处理系统，用于从多种来源抓取文档内容，并将其向量化存储到向量数据库，以便后续检索和问答。

## 特点

- **流式处理**：采用边爬取边处理边存储的真正流式架构，有效解决内存溢出问题
- **多源支持**：支持从网站、GitHub仓库和本地文件抓取文档内容
- **内存优化**：通过批处理、垃圾回收和引用清理等技术优化内存使用
- **灵活配置**：提供丰富的配置选项，适应不同场景的需求
- **命令行工具**：提供易用的命令行工具，快速处理文档源

## 安装

```bash
# 安装依赖
npm install

# 安装全局命令行工具（可选）
npm link
```

## 使用方法

### 命令行工具

这个系统提供了强大的命令行工具，用于处理不同类型的文档源：

#### 处理网站

```bash
# 使用优化的内存设置
node --max-old-space-size=4096 --expose-gc src/cli/stream-process.ts website --url https://docs.nervos.org --name "Nervos Docs"

# 如果已全局安装
stream-process website --url https://docs.nervos.org --name "Nervos Docs"
```

#### 处理GitHub仓库

```bash
# 使用优化的内存设置
node --max-old-space-size=4096 --expose-gc src/cli/stream-process.ts github --url https://github.com/nervosnetwork/rfcs

# 如果已全局安装
stream-process github --url https://github.com/nervosnetwork/rfcs
```

#### 使用配置文件

```bash
# 直接使用代码中定义的配置
stream-process process
```

#### 检查内存使用情况

```bash
stream-process check-memory
```

### 编程接口

您也可以在代码中使用该系统，以更灵活的方式处理文档：

```typescript
import { DocumentSource } from './documents/core/types';
import { DocumentProcessor, VectorService } from './documents/core/processor';

// 创建自定义向量化服务
class MyVectorService implements VectorService {
  async vectorizeAndStore(chunks) {
    // 实现您的向量化和存储逻辑
    console.log(`处理 ${chunks.length} 个文档块`);
    return { success: true, count: chunks.length };
  }
}

// 创建文档处理器
const processor = new DocumentProcessor(new MyVectorService());

// 定义文档源
const source: DocumentSource = {
  name: 'Nervos Docs',
  url: 'https://docs.nervos.org',
  type: 'website',
  enabled: true
};

// 处理文档源
async function processDocuments() {
  const result = await processor.processSource(source);
  console.log(`处理结果: ${result.success ? '成功' : '失败'}`);
  console.log(`文档块数量: ${result.stats?.totalChunks || 0}`);
}

processDocuments();
```

## 配置文件

系统配置存储在 `src/documents/core/config.ts` 文件中，包含以下部分：

- OpenAI 和向量存储配置
- GitHub API 和抓取器配置
- 各种文档源的处理参数
- CKB 文档源列表 (CKB_DOCUMENT_SOURCES)

您可以修改此文件以自定义文档处理行为。

## 内存优化建议

为了获得最佳性能并避免内存溢出问题，建议：

1. 使用 `--max-old-space-size` 参数增加Node.js可用内存：
   ```bash
   node --max-old-space-size=8192 your-script.js
   ```

2. 启用手动垃圾回收：
   ```bash
   node --expose-gc your-script.js
   ```

3. 调整批处理大小和间隔时间，以适应您的系统性能。

## API文档

### DocumentProcessor

主要的文档处理协调器，负责组织整个处理流程。

```typescript
class DocumentProcessor {
  constructor(vectorService: VectorService, config?: Partial<BatchProcessConfig>);
  processSource(source: DocumentSource): Promise<ScrapingResult>;
  processSources(sources: DocumentSource[]): Promise<{
    total: number;
    successful: number;
    failed: number;
    totalChunks: number;
  }>;
}
```

### VectorService

向量化和存储服务接口，用于将文档块转换为向量并存储到数据库。

```typescript
interface VectorService {
  vectorizeAndStore(chunks: DocumentChunk[]): Promise<{
    success: boolean;
    count: number;
    error?: Error;
  }>;
}
```

### 抓取函数

针对不同类型的文档源的专用抓取函数：

```typescript
function scrapeWebsite(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult>;

function scrapeGitHubRepo(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult>;

function processLocalFile(
  source: DocumentSource,
  chunkProcessor?: DocumentChunkProcessor
): Promise<ScrapingResult>;
```

## 许可证

MIT
