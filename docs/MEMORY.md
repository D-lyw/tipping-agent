# 内存管理指南

## 问题描述

RAG系统处理大型GitHub仓库时遇到了内存溢出问题：

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

## 解决方案

1. **增加Node.js内存限制**

   运行应用时增加内存限制：

   ```bash
   NODE_OPTIONS='--max-old-space-size=8192 --expose-gc' npm run dev
   ```

   或者构建后运行：

   ```bash
   NODE_OPTIONS='--max-old-space-size=8192 --expose-gc' node dist/index.js
   ```

2. **使用批处理减少内存压力**

   我们已经修改了代码，使用更小的批次大小来处理文档：
   
   - GitHub爬虫中的文档批处理大小从50减少到20
   - MastraVectorStore中的批次大小从20减少到10
   - 添加了定期垃圾回收和处理间隔，帮助释放内存

3. **环境变量配置**

   确保使用正确的环境变量名称：
   
   ```
   POSTGRES_CONNECTION_STRING=postgres://user:password@host:port/database
   VECTOR_INDEX_NAME=document_embeddings
   ```

## 监控内存使用

你可以使用内存检查命令监控内存使用情况：

```bash
npm run stream-process check-memory
```

## 最佳实践

1. 处理大型仓库时使用更小的批次大小：

   ```bash
   npm run stream-process test-github -u https://github.com/username/repo -b 5 -i 1000 -d 2 --limit-files
   ```

2. 必要时清空向量数据库：

   ```bash
   npm run stream-process clear-vectors --confirm
   ```

3. 适当限制处理深度和文件数量，使用参数：
   - `-d, --max-depth`: 限制目录深度
   - `--limit-files`: 限制处理的文件数
   - `--skip-code`: 跳过代码文件处理 