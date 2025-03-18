# Nostr 协议集成文档

## 概述

本项目已成功集成 Nostr 去中心化社交协议，使 CKB 生态内容互动打赏 Agent 能够同时监控和互动 Twitter 和 Nostr 两个平台上的 CKB 相关内容。Nostr 作为一个去中心化的社交网络协议，为打赏系统提供了更广泛的内容来源和更强的隐私保护能力。

## 关键特性

1. **多平台内容监控**：同时监控 Twitter 和 Nostr 平台上的 CKB 相关内容
2. **Nostr 内容评估**：识别 Nostr 平台上的 CKB 地址并评估内容质量
3. **跨平台内容分享**：将高质量的 Twitter 内容分享到 Nostr 网络，扩大传播范围
4. **自动打赏**：对 Nostr 平台上包含 CKB 地址的高质量内容进行自动打赏

## 技术实现

### 核心组件

1. **NostrMonitor**：负责连接 Nostr 网络，监控和发布内容
   - 位置：`src/lib/nostrMonitor.ts`
   - 主要功能：初始化 Nostr 客户端、连接中继服务器、监控标签、发布笔记

2. **简化的测试工具**：用于测试 Nostr 功能的独立工具
   - 位置：`simple-nostr.js`
   - 主要功能：监听 Nostr 网络上的 CKB 相关内容，可发布测试消息

3. **CKB 生态监控工作流**：整合 Twitter 和 Nostr 监控的工作流
   - 位置：`src/workflows/ckbEcosystemMonitor.ts`
   - 主要功能：初始化 Nostr 监控、共享高质量内容到 Nostr

### 使用的库

- **nostr-tools**：Nostr 协议的 JavaScript/TypeScript 实现库
  - 版本：2.11.0
  - 主要使用功能：密钥管理、事件签名和验证、与中继连接

## 配置与使用

### 环境变量配置

在 `.env` 文件中添加以下配置：

```
# Nostr 设置
NOSTR_PRIVATE_KEY=your_nostr_private_key  # Nostr 私钥
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.nostr.info,wss://nos.lol  # 中继服务器，逗号分隔
NOSTR_MONITOR_INTERVAL=60000  # 监控间隔（毫秒）
NOSTR_TEST_PUBLISH=false  # 是否在启动时发布测试笔记
```

### 生成 Nostr 密钥

如果你没有 Nostr 密钥，可以使用以下命令生成：

```bash
npm run gen-nostr-key
```

这将生成一个新的密钥对，将输出的私钥复制到 `.env` 文件的 `NOSTR_PRIVATE_KEY` 字段中。

### 测试 Nostr 功能

1. 监听 Nostr 网络上的 CKB 相关内容：

```bash
npm run simple-nostr
```

2. 发布测试消息到 Nostr 网络：

```bash
npm run simple-nostr:publish
```

## 故障排除

### 常见问题

1. **连接中继服务器失败**
   - 确保网络连接正常
   - 验证中继服务器地址是否正确
   - 尝试更换其他中继服务器

2. **无法发布内容**
   - 检查是否正确配置了私钥
   - 确保私钥格式正确（去除可能的 0x 前缀）

3. **没有收到消息**
   - 确认订阅的标签是否正确
   - 中继服务器可能没有相关内容，尝试添加更多中继

### 日志

查看控制台输出的日志信息，可以帮助诊断问题：
- 连接状态信息
- 收到的事件详情
- 发布结果通知

## 未来计划

1. **完善 Nostr 监控**：增强内容过滤能力，避免垃圾信息
2. **互动增强**：实现在 Nostr 上对内容的点赞和评论功能
3. **用户认证**：增加 NIP-05 认证支持，验证用户身份
4. **内容聚合**：跨平台聚合相同主题的内容，创建更全面的生态讨论视图

## 参考资料

1. [Nostr 协议文档](https://github.com/nostr-protocol/nostr)
2. [nostr-tools 库文档](https://github.com/nbd-wtf/nostr-tools)
3. [Nostr NIPs (Nostr Implementation Possibilities)](https://github.com/nostr-protocol/nips) 