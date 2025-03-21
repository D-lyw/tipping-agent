# Render 部署指南

本文档提供了将 tapping-agent 项目部署到 Render 平台的详细步骤。

## 什么是 Render？

[Render](https://render.com) 是一个现代化的云平台，用于托管静态网站、Web 服务、后台作业等，它提供了比传统 PaaS 平台更简单的开发者体验，同时支持持续运行的服务，非常适合 Node.js 应用。

## 部署优势

使用 Render 部署 tapping-agent 的主要优势：

1. **持续运行**：服务可以不间断运行，非常适合 Nostr 监控等需要持续监听的服务
2. **自动扩展**：根据负载自动扩展服务
3. **简单的 CI/CD**：与 Git 仓库集成，自动部署
4. **免费套餐**：有免费套餐可用于测试和小规模项目
5. **环境变量管理**：安全存储敏感信息和配置

## 部署步骤

### 方法 1：一键部署

最简单的方法是使用 README 中提供的"Deploy to Render"按钮：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yourusername/tapping-agent)

这将指导您完成以下步骤：
1. 连接 GitHub 仓库
2. 配置服务设置
3. 设置环境变量
4. 部署应用

### 方法 2：手动部署

#### 1. 创建 Web Service

1. 登录到 [Render Dashboard](https://dashboard.render.com)
2. 点击 "New +" 按钮
3. 选择 "Web Service"
4. 连接您的 GitHub 或 GitLab 仓库
5. 找到并选择 tapping-agent 仓库

#### 2. 配置服务

填写以下信息：
- **Name**：tapping-agent（或您喜欢的名称）
- **Region**：选择距离您的用户最近的地区
- **Branch**：main（或您的主分支）
- **Runtime**：Node
- **Build Command**：`npm install && npm run build`
- **Start Command**：`node dist/index.js`
- **Plan**：根据您的需求选择（Free 或 Starter）

#### 3. 设置环境变量

在 "Environment" 部分，添加以下变量：

| 变量名 | 说明 |
|-------|------|
| `NODE_ENV` | 设置为 `production` |
| `OPENAI_API_KEY` | 您的 OpenAI API 密钥 |
| `NOSTR_PRIVATE_KEY` | Nostr 私钥（十六进制格式） |
| `DISCORD_BOT_TOKEN` | Discord 机器人令牌（如果使用） |
| `ENABLE_CKB_BOT` | 是否启用 CKB Discord 机器人（"true" 或 "false"） |
| `ENABLE_NOSTR` | 是否启用 Nostr 监控（"true" 或 "false"） |

#### 4. 高级选项（可选）

点击 "Advanced" 可以配置：
- **Auto-Deploy**：启用或禁用自动部署
- **Health Check Path**：设置为 `/health` 以监控服务健康状态
- **HTTP 请求超时**：调整请求超时设置
- **初始化超时**：调整启动超时设置

#### 5. 创建服务

点击 "Create Web Service" 按钮创建服务。Render 将自动构建和部署您的应用。

## 监控与管理

部署完成后，您可以：

- 在 Render 仪表板查看日志和性能指标
- 设置自定义域名（付费计划）
- 配置监控和警报
- 查看 CPU 和内存使用情况

## 健康检查端点

项目已包含一个内置的健康检查 API 端点，可用于监控应用状态：

```
GET /health
```

此端点将返回：
- 服务状态概览
- 各个子服务的状态（如 Nostr 监控服务）
- 系统信息（内存使用、运行时间等）

**在 Render 中使用健康检查**：
在部署服务时，你可以在高级选项中设置健康检查 URL 为 `/health`，Render 将定期检查此端点以确认服务正常运行。

## 监控服务

部署到 Render 后，可以通过以下方式监控服务：

1. **Render 仪表板**：查看日志、CPU/内存使用情况
2. **健康检查 API**：访问 `https://your-app-name.onrender.com/health`
3. **电子邮件通知**：在 Render 中设置状态变更通知

如需更高级的监控，可考虑集成第三方服务如 Datadog、New Relic 或 Sentry。

## 常见问题

### 应用部署成功但无法访问

检查：
- 日志中是否有错误信息
- 启动命令是否正确
- 端口配置（Render 会通过 `PORT` 环境变量指定端口）

### 环境变量不生效

确保：
- 变量名称与代码中使用的匹配
- 没有多余的空格
- 敏感信息没有引号包围

### 应用崩溃或重启

检查：
- 内存使用是否过高
- 是否有未捕获的异常
- 日志中的错误信息

## 性能优化

1. **合理使用内存**：监控和限制内存使用
2. **实现优雅关闭**：处理 SIGTERM 信号
3. **添加健康检查**：帮助 Render 判断应用状态
4. **启用压缩**：使用 gzip/brotli 减少带宽使用

## 成本估算

| 计划 | 价格 | 特点 |
|-----|-----|-----|
| Free | $0/月 | - 512MB RAM<br>- 共享 CPU<br>- 暂停不活动服务 |
| Starter | $7/月 | - 512MB RAM<br>- 共享 CPU<br>- 持续运行<br>- 自定义域名 |
| Standard | $15+/月 | - 1GB+ RAM<br>- 专用 CPU<br>- 自动扩展<br>- 全功能套件 |

对于您的 Nostr 监控服务，建议至少使用 Starter 计划，确保服务不会因不活动而暂停。 