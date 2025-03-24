# CKB本地文档目录

这个目录用于存放CKB相关的本地文档，系统会自动加载此目录下的所有文件作为文档源。

## 如何使用

1. 将您的CKB相关文档（如白皮书、技术规范、开发指南等）放置在此目录下
2. 文档可以是以下格式：
   - Markdown文件 (`.md`, `.markdown`)
   - 文本文件 (`.txt`)
   - PDF文件 (`.pdf`)
   - 代码文件 (`.js`, `.ts`, `.html`, `.css`, `.json`)
3. 系统在启动或刷新文档索引时会自动加载这些文件
4. 无需任何额外配置或命令

## 推荐的目录结构

为了更好地组织您的文档，建议按照以下结构放置文件：

```
data/ckb-docs/
  ├── whitepaper/        # 白皮书和基础概念文档
  │   ├── ckb-whitepaper-cn.md
  │   └── ckb-whitepaper-en.md
  ├── rfcs/              # RFC文档
  │   ├── rfc0001.md
  │   └── rfc0002.md
  ├── specs/             # 技术规范
  │   ├── ckb-vm.md
  │   └── cell-model.md
  ├── tutorials/         # 教程和指南
  │   ├── getting-started.md
  │   └── smart-contract.md
  └── references/        # 参考资料
      ├── glossary.md
      └── api-reference.md
```

## 注意事项

1. 系统会递归处理所有子目录
2. 大文件会被自动分割成多个片段
3. 所有文档都会被存储在缓存中，以便快速检索
4. PDF文件目前只能提取纯文本内容，复杂格式可能会丢失
5. 更新文档后，需要重启系统或手动调用`fetchAllDocuments(true)`刷新文档索引 