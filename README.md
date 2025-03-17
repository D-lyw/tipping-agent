# Tapping Agent

这是一个基于 Twitter/X 的 CKB 打赏 Agent，可以监控推文回复并自动打赏包含 CKB 地址的回复。

## 功能特点

- 自动监控指定推文的回复
- 识别回复中的 CKB 地址
- 使用 tappingAgent 自动打赏有价值的内容
- 支持通过环境变量配置监控参数

## 安装与配置

1. 克隆仓库
```bash
git clone https://github.com/yourusername/tapping-agent.git
cd tapping-agent
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
```bash
cp .env.example .env
```
然后编辑 `.env` 文件，填写以下信息：
- Twitter API 凭证 (TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET)
- Twitter 用户 ID (TWITTER_USER_ID)
- 监控间隔时间 (MONITOR_INTERVAL)，单位为毫秒，默认为 60000（60秒）
- 预设监控的推文 ID (MONITORED_TWEETS)，多个 ID 用逗号分隔

## 使用方法

### 方法一：使用启动脚本

```bash
chmod +x start.sh
./start.sh
```

### 方法二：手动启动

1. 编译 TypeScript
```bash
npm run build
```

2. 启动应用
```bash
npm start
```

### 方法三：使用 tsx 直接运行（开发模式）

```bash
npm run monitor
```

## 监控推文

有两种方式可以监控推文：

1. 通过环境变量预设监控的推文 ID
   在 `.env` 文件中设置 `MONITORED_TWEETS` 变量

2. 通过 API 动态添加监控
   ```typescript
   // 使用工作流添加监控
   await mastra.workflows.xWorkflow.trigger({
     action: 'start-monitoring-tweet',
     tweetId: '1234567890'
   });
   ```

## 自动打赏逻辑

当检测到包含 CKB 地址的回复时，系统会：

1. 提取回复中的 CKB 地址
2. 调用 tappingAgent 进行内容价值评估
3. 根据内容价值自动进行打赏

## 日志

应用运行时会在控制台输出日志，包括：
- 监控服务的启动和停止
- 新添加和移除的监控推文
- 检测到的新回复
- 打赏操作的结果

## 许可证

ISC 