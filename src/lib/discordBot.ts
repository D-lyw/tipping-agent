/**
 * Discord Bot服务
 * 
 * 实现与Discord用户的交互，接收问题并调用CKB文档智能体返回答案
 */

import { Client, Events, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import { ckbDocAgent, askCkbQuestion, streamCkbQuestion } from '../mastra/agents/ckbDocAgent';
import { createDocumentManager } from '../documents';
import dotenv from 'dotenv';

dotenv.config();

// Bot配置接口
export interface DiscordBotConfig {
  token: string;
  prefix: string;
  channelIds?: string[];
  openaiApiKey?: string; // 保留以兼容现有代码
  modelName?: string;    // 保留以兼容现有代码
  memorySize?: number;   // 保留以兼容现有代码
}

// 命令类型
type CommandHandler = (message: Message, args: string[]) => Promise<void>;

export class CkbDiscordBot {
  private client: Client;
  private config: DiscordBotConfig;
  private isReady: boolean = false;
  private processingMessages: Set<string> = new Set();
  private commands: Map<string, CommandHandler> = new Map();
  
  constructor(config: DiscordBotConfig) {
    this.config = config;
    
    // 如果没有指定前缀，则使用默认前缀
    if (!this.config.prefix) {
      this.config.prefix = '!ckb';
    }
    
    // 初始化Discord客户端
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });
    
    // 注册命令
    this.registerCommands();
    
    // 设置事件监听器
    this.setupEventListeners();
  }
  
  private registerCommands() {
    // 帮助命令
    this.commands.set('help', async (message, args) => {
      const helpText = `
**CKB文档问答机器人使用帮助**

直接提问：
  ${this.config.prefix} 你的问题
  或者直接提及机器人 @CKB文档助手 你的问题
  或者通过私信发送问题

可用命令：
  ${this.config.prefix} help - 显示此帮助信息
  ${this.config.prefix} refresh - 刷新文档缓存
  ${this.config.prefix} info - 显示Bot信息
  ${this.config.prefix} clear - 清除对话历史

例如：
  ${this.config.prefix} CKB的共识机制是什么?
`;
      await message.reply(helpText);
    });
    
    // 刷新文档缓存命令
    this.commands.set('refresh', async (message, args) => {
      const refreshMessage = await message.reply('正在刷新文档缓存，请稍候...');
      try {
        const docManager = createDocumentManager();
        await docManager.initialize();
        // 先清空缓存
        await docManager.clearCache();
        // 然后重新获取所有文档
        await docManager.fetchAllSources();
        await refreshMessage.edit('文档缓存已刷新。');
      } catch (error) {
        console.error('刷新文档缓存失败:', error);
        await refreshMessage.edit('刷新文档缓存失败，请查看日志。');
      }
    });
    
    // 显示Bot信息命令
    this.commands.set('info', async (message, args) => {
      const infoText = `
**CKB文档问答机器人信息**

状态：${this.isRunning() ? '✅ 运行中' : '❌ 未运行'}
命令前缀：${this.config.prefix}
使用的模型：${process.env.CKB_AGENT_MODEL || process.env.MODEL_NAME || 'gpt-4-turbo-preview'}
记忆大小：${process.env.CKB_AGENT_MEMORY_SIZE || process.env.MEMORY_SIZE || '10'} 条消息
启动时间：${new Date(this.client.readyTimestamp || Date.now()).toLocaleString()}
`;
      await message.reply(infoText);
    });
    
    // 清除对话历史命令
    this.commands.set('clear', async (message, args) => {
      // 目前我们无法直接清除内存，但可以告知用户
      await message.reply('由于智能体内存由 Mastra 框架管理，目前无法清除对话历史。请通过重新启动 CKB 文档助手来清除历史。');
    });
  }
  
  private setupEventListeners() {
    // 准备就绪事件
    this.client.on(Events.ClientReady, () => {
      console.log(`已登录到Discord，账号: ${this.client.user?.tag}`);
      this.isReady = true;
    });
    
    // 消息事件
    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        // 避免处理机器人自己的消息
        if (message.author.bot) return;
        
        // 检查是否在允许的频道中
        if (
          this.config.channelIds && 
          this.config.channelIds.length > 0 && 
          message.channelId && 
          !this.config.channelIds.includes(message.channelId)
        ) {
          return;
        }
        
        // 检查消息是否以前缀开头或者是私信
        const isDM = message.channel.isDMBased();
        const mentionedBot = message.mentions.users.has(this.client.user!.id);
        const startsWithPrefix = message.content.startsWith(this.config.prefix);
        
        if (!isDM && !mentionedBot && !startsWithPrefix) {
          return;
        }
        
        // 避免重复处理同一消息
        if (this.processingMessages.has(message.id)) {
          return;
        }
        
        this.processingMessages.add(message.id);
        
        // 提取问题内容
        let content = message.content;
        
        // 去除前缀或提及
        if (startsWithPrefix) {
          content = content.slice(this.config.prefix.length).trim();
        } else if (mentionedBot) {
          content = content.replace(new RegExp(`<@!?${this.client.user!.id}>`), '').trim();
        }
        
        if (!content) {
          message.reply('请输入您关于CKB的技术问题。例如：!ckb CKB的共识机制是什么?');
          this.processingMessages.delete(message.id);
          return;
        }
        
        // 检查是否是命令
        const args = content.split(/\s+/);
        const commandName = args[0].toLowerCase();
        
        if (this.commands.has(commandName)) {
          const command = this.commands.get(commandName)!;
          await command(message, args.slice(1));
          this.processingMessages.delete(message.id);
          return;
        }
        
        // 将整个内容视为问题
        const question = content;
        
        console.log(`用户 ${message.author.tag} 提问: ${question}`);
        
        // 发送"正在处理"的状态
        const thinkingMessage = await message.reply('正在查询相关文档，请稍候...');
        
        // 调用智能体回答问题
        try {
          console.log(`开始处理问题: ${question}`);
          const startTime = Date.now();
          
          // 使用流式输出替代一次性返回
          const ckbDocAgentResponse = await streamCkbQuestion(question);
          
          // 用于累积完整回答的字符串
          let accumulatedAnswer = '';
          // 上次更新消息的时间戳，用于控制更新频率
          let lastUpdateTime = Date.now();
          // 更新间隔 (毫秒)
          const UPDATE_INTERVAL = 500;
          
          // 首次更新消息内容
          await thinkingMessage.edit('正在生成回答: ');
          
          // 处理流式响应
          for await (const chunk of ckbDocAgentResponse.textStream) {
            // 累积回答
            accumulatedAnswer += chunk;
            
            // 控制更新频率，避免频繁API调用
            const currentTime = Date.now();
            if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
              try {
                // 如果累积内容过长，就只显示最后的2000个字符
                const displayContent = accumulatedAnswer.length > 2000 
                  ? accumulatedAnswer.slice(-2000) 
                  : accumulatedAnswer;
                
                await thinkingMessage.edit(displayContent);
                lastUpdateTime = currentTime;
              } catch (editError) {
                console.error('更新消息时出错:', editError);
              }
            }
          }
          
          const endTime = Date.now();
          console.log(`问题处理完成，耗时: ${(endTime - startTime) / 1000}秒`);
          console.log(`生成的回答长度: ${accumulatedAnswer.length} 字符`);
          
          // 响应过长时分段发送
          if (accumulatedAnswer.length > 2000) {
            const chunks = this.splitMessage(accumulatedAnswer);
            console.log(`回答长度为 ${accumulatedAnswer.length} 字符，将分为 ${chunks.length} 条消息发送`);
            
            // 编辑第一条消息
            await thinkingMessage.edit(chunks[0]);
            
            // 发送剩余的块
            for (let i = 1; i < chunks.length; i++) {
              // 对不同类型的频道使用不同的发送方法
              if ('send' in message.channel) {
                await message.channel.send(chunks[i]);
              } else {
                // 如果无法直接发送，尝试回复
                await message.reply(chunks[i]);
              }
            }
          } else {
            // 确保最终的完整响应被发送
            await thinkingMessage.edit(accumulatedAnswer);
          }
        } catch (error) {
          console.error('智能体生成回答时出错:', error);
          await thinkingMessage.edit('抱歉，处理您的问题时遇到了错误。请稍后再试。');
        }
      } catch (error) {
        console.error('处理Discord消息时出错:', error);
        
        // 尝试发送错误通知
        try {
          await message.reply('抱歉，处理您的问题时遇到了错误。请稍后再试。');
        } catch (replyError) {
          console.error('无法发送错误回复:', replyError);
        }
      } finally {
        // 无论如何都要从处理集合中移除消息
        this.processingMessages.delete(message.id);
      }
    });
    
    // 错误处理
    this.client.on(Events.Error, (error) => {
      console.error('Discord客户端错误:', error);
    });
    
    // 断线重连
    this.client.on(Events.Warn, (info) => {
      console.warn('Discord客户端警告:', info);
    });
    
    this.client.on(Events.Debug, (info) => {
      // 只在调试模式下输出详细信息
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug('Discord客户端调试:', info);
      }
    });
  }
  
  /**
   * 将长消息分割成多个片段
   */
  private splitMessage(text: string, maxLength = 2000): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    // 按行分割
    const lines = text.split('\n');
    
    for (const line of lines) {
      // 如果单行超过最大长度，需要进一步分割
      if (line.length > maxLength) {
        // 先添加当前块
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // 分割长行
        for (let i = 0; i < line.length; i += maxLength) {
          chunks.push(line.substring(i, i + maxLength));
        }
        continue;
      }
      
      // 如果当前行加上当前块会超过最大长度，则创建新的块
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        // 否则，将行添加到当前块
        if (currentChunk) {
          currentChunk += '\n' + line;
        } else {
          currentChunk = line;
        }
      }
    }
    
    // 添加最后一个块
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  /**
   * 启动Discord Bot
   */
  public async start(): Promise<void> {
    try {
      // 确保有Discord令牌
      if (!this.config.token) {
        throw new Error('缺少Discord令牌！请在配置中提供有效的token。');
      }
      
      console.log('正在启动CKB文档Discord Bot...');
      console.log(`使用配置:
- 命令前缀: ${this.config.prefix}
- 允许的频道: ${this.config.channelIds?.join(', ') || '所有频道'}
- 模型: ${process.env.CKB_AGENT_MODEL || process.env.MODEL_NAME || 'gpt-4-turbo-preview'}
- 记忆大小: ${process.env.CKB_AGENT_MEMORY_SIZE || process.env.MEMORY_SIZE || '10'} 条消息`);
      
      // 登录Discord
      await this.client.login(this.config.token);
      
      console.log('CKB文档Discord Bot已启动');
    } catch (error) {
      console.error('启动Discord Bot失败:', error);
      throw error;
    }
  }
  
  /**
   * 停止Discord Bot
   */
  public async stop(): Promise<void> {
    try {
      console.log('正在关闭Discord Bot...');
      
      // 清理资源
      this.isReady = false;
      
      // 关闭Discord客户端
      this.client.destroy();
      
      console.log('Discord Bot已关闭');
    } catch (error) {
      console.error('关闭Discord Bot时出错:', error);
    }
  }
  
  /**
   * 检查Bot是否准备就绪
   */
  public isRunning(): boolean {
    return this.isReady && this.client.isReady();
  }
  
  /**
   * 向指定频道发送消息
   */
  public async sendMessage(channelId: string, content: string): Promise<void> {
    try {
      if (!this.isRunning()) {
        throw new Error('Discord Bot未运行，无法发送消息');
      }
      
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error(`无法找到文本频道: ${channelId}`);
      }
      
      // 消息过长时分段发送
      if (content.length > 2000) {
        const chunks = this.splitMessage(content);
        for (const chunk of chunks) {
          await channel.send(chunk);
        }
      } else {
        await channel.send(content);
      }
    } catch (error) {
      console.error('发送Discord消息失败:', error);
      throw error;
    }
  }

  /**
   * 向指定频道发送流式消息
   * @param channelId 频道ID
   * @param getContentStream 获取内容流的函数
   */
  public async sendStreamingMessage(channelId: string, getContentStream: () => AsyncIterable<string>): Promise<void> {
    try {
      if (!this.isRunning()) {
        throw new Error('Discord Bot未运行，无法发送消息');
      }
      
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error(`无法找到文本频道: ${channelId}`);
      }
      
      // 发送初始消息
      const initialMessage = await channel.send('正在生成回答...');
      
      // 用于累积完整回答的字符串
      let accumulatedAnswer = '';
      // 上次更新消息的时间戳
      let lastUpdateTime = Date.now();
      // 更新间隔 (毫秒)
      const UPDATE_INTERVAL = 500;
      
      // 处理流式响应
      const contentStream = getContentStream();
      for await (const chunk of contentStream) {
        // 累积回答
        accumulatedAnswer += chunk;
        
        // 控制更新频率
        const currentTime = Date.now();
        if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
          try {
            // 如果累积内容过长，就只显示最后的2000个字符
            const displayContent = accumulatedAnswer.length > 2000 
              ? accumulatedAnswer.slice(-2000) 
              : accumulatedAnswer;
            
            await initialMessage.edit(displayContent);
            lastUpdateTime = currentTime;
          } catch (editError) {
            console.error('更新消息时出错:', editError);
          }
        }
      }
      
      // 发送最终完整的响应
      if (accumulatedAnswer.length > 2000) {
        const chunks = this.splitMessage(accumulatedAnswer);
        console.log(`流式回答长度为 ${accumulatedAnswer.length} 字符，将分为 ${chunks.length} 条消息发送`);
        
        // 编辑第一条消息
        await initialMessage.edit(chunks[0]);
        
        // 发送剩余的块
        for (let i = 1; i < chunks.length; i++) {
          await channel.send(chunks[i]);
        }
      } else {
        // 确保最终的完整响应被发送
        await initialMessage.edit(accumulatedAnswer);
      }
    } catch (error) {
      console.error('发送流式Discord消息失败:', error);
      throw error;
    }
  }

  /**
   * 向指定频道发送CKB问题的流式回答
   * @param channelId 频道ID
   * @param question CKB相关问题
   */
  public async sendCkbQuestionStream(channelId: string, question: string): Promise<void> {
    try {
      if (!this.isRunning()) {
        throw new Error('Discord Bot未运行，无法发送消息');
      }
      
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error(`无法找到文本频道: ${channelId}`);
      }
      
      // 发送初始消息
      const initialMessage = await channel.send('正在查询相关文档，请稍候...');
      
      console.log(`开始处理问题: ${question}`);
      const startTime = Date.now();
      
      // 使用流式输出
      const ckbDocAgentResponse = await streamCkbQuestion(question);
      
      // 用于累积完整回答的字符串
      let accumulatedAnswer = '';
      // 上次更新消息的时间戳
      let lastUpdateTime = Date.now();
      // 更新间隔 (毫秒)
      const UPDATE_INTERVAL = 500;
      
      // 首次更新消息内容
      await initialMessage.edit('正在生成回答: ');
      
      // 处理流式响应
      for await (const chunk of ckbDocAgentResponse.textStream) {
        // 累积回答
        accumulatedAnswer += chunk;
        
        // 控制更新频率
        const currentTime = Date.now();
        if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
          try {
            // 如果累积内容过长，就只显示最后的2000个字符
            const displayContent = accumulatedAnswer.length > 2000 
              ? accumulatedAnswer.slice(-2000) 
              : accumulatedAnswer;
            
            await initialMessage.edit(displayContent);
            lastUpdateTime = currentTime;
          } catch (editError) {
            console.error('更新消息时出错:', editError);
          }
        }
      }
      
      const endTime = Date.now();
      console.log(`问题处理完成，耗时: ${(endTime - startTime) / 1000}秒`);
      console.log(`生成的回答长度: ${accumulatedAnswer.length} 字符`);
      
      // 发送最终完整的响应
      if (accumulatedAnswer.length > 2000) {
        const chunks = this.splitMessage(accumulatedAnswer);
        console.log(`回答长度为 ${accumulatedAnswer.length} 字符，将分为 ${chunks.length} 条消息发送`);
        
        // 编辑第一条消息
        await initialMessage.edit(chunks[0]);
        
        // 发送剩余的块
        for (let i = 1; i < chunks.length; i++) {
          await channel.send(chunks[i]);
        }
      } else {
        // 确保最终的完整响应被发送
        await initialMessage.edit(accumulatedAnswer);
      }
    } catch (error) {
      console.error('发送CKB问题流式Discord消息失败:', error);
      throw error;
    }
  }
} 