import { SimplePool } from 'nostr-tools/pool';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

// 确保环境变量已加载
dotenv.config();

// 定义事件类型
export enum NostrContentFetcherEvent {
  NEW_CONTENT = 'new_content',
  ERROR = 'error',
}

// 定义内容对象接口
export interface NostrContent {
  id: string;              // 事件ID
  pubkey: string;          // 作者公钥
  content: string;         // 内容文本
  created_at: number;      // 创建时间
  tags: string[][];        // 标签列表
  source: 'nostr';         // 内容源平台
}

/**
 * Nostr 内容检索器
 * 用于从 Nostr 网络获取 CKB 相关内容
 */
export class NostrContentFetcher extends EventEmitter {
  private pool: SimplePool;
  private relays: string[] = [];
  // private monitoredTags: string[] = ['ckb', 'nervos', 'utxo', "fiber", "fibernetwork", "joyid", "lightning"];
  private monitoredTags: string[] = ['ckb'];

  private lastFetchTime: number = 0;
  private subscriptions: { [key: string]: any } = {};
  private contentCache: Set<string> = new Set(); // 缓存已处理的内容ID
  private maxCacheSize: number = 1000; // 最大缓存大小

  constructor() {
    super();
    this.pool = new SimplePool();
  }

  /**
   * 初始化 Nostr 内容检索器
   * @param relays 中继服务器列表
   * @param tags 要监控的标签
   */
  public init(relays: string[] = [], tags: string[] = []): void {
    // 如果提供了中继列表，则使用它
    if (relays.length > 0) {
      this.relays = relays;
    } else {
      // 否则使用环境变量中的中继列表
      const relaysStr = process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://strfry.iris.to,wss://relay.nostr.info,wss://nos.lol';
      this.relays = relaysStr.split(',').map(relay => relay.trim());
    }

    // 如果提供了标签列表，则使用它
    if (tags.length > 0) {
      this.monitoredTags = tags;
    }

    console.log(`Nostr内容检索器初始化完成，连接到 ${this.relays.length} 个中继`);
    console.log(`监控标签: ${this.monitoredTags.join(', ')}`);
  }

  /**
   * 添加中继服务器
   * @param url 中继服务器URL
   */
  public addRelay(url: string): void {
    if (!this.relays.includes(url)) {
      this.relays.push(url);
      console.log(`已添加中继服务器: ${url}`);
    }
  }

  /**
   * 添加监控标签
   * @param tag 标签
   */
  public addTag(tag: string): void {
    if (!this.monitoredTags.includes(tag)) {
      this.monitoredTags.push(tag);
      console.log(`已添加监控标签: ${tag}`);
    }
  }

  /**
   * 设置最后一次检索时间
   * @param timestamp 时间戳（秒）
   */
  public setLastFetchTime(timestamp: number): void {
    this.lastFetchTime = timestamp;
  }

  /**
   * 获取最后一次检索时间
   * @returns 时间戳（秒）
   */
  public getLastFetchTime(): number {
    return this.lastFetchTime;
  }

  /**
   * 处理新事件
   * @param event Nostr 事件对象
   */
  private handleEvent(event: any): void {
    try {
      // 如果已经处理过这个事件，跳过
      if (this.contentCache.has(event.id)) {
        return;
      }

      // 转换为内容对象
      const content: NostrContent = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        tags: event.tags,
        source: 'nostr',
      };

      // 缓存事件 ID
      this.contentCache.add(event.id);

      // 如果缓存过大，移除最旧的项
      if (this.contentCache.size > this.maxCacheSize) {
        const firstItem = Array.from(this.contentCache)[0];
        if (firstItem) this.contentCache.delete(firstItem);
      }

      console.log(`收到新的 Nostr 内容: ${content.id}`);

      // 发出新内容事件
      this.emit(NostrContentFetcherEvent.NEW_CONTENT, content);
    } catch (error) {
      console.error('处理 Nostr 事件失败:', error);
      this.emit(NostrContentFetcherEvent.ERROR, error);
    }
  }

  /**
   * 检索最新的 CKB 相关内容
   * @param since 起始时间戳（秒）
   * @param limit 最大返回数量
   * @returns 包含 Nostr 内容的 Promise
   */
  public async fetchRecentContent(since: number = 0, limit: number = 50): Promise<NostrContent[]> {
    try {
      // 如果未指定起始时间，使用上次检索时间
      const sinceTime = since > 0 ? since : this.lastFetchTime;

      console.log(`从 ${this.relays.length} 个中继检索内容, 起始时间: ${new Date(sinceTime * 1000).toISOString()}`);

      // 结果集合
      const contents: NostrContent[] = [];

      // 为每个标签创建过滤器并查询
      for (const tag of this.monitoredTags) {
        try {
          // 创建标签过滤器
          const tagFilter = {
            kinds: [1],
            "#t": [tag],
            since: sinceTime,
            limit: limit
          };

          // 查询事件
          const events = await this.pool.querySync(this.relays, tagFilter);

          // 处理结果
          for (const event of events) {
            // 如果已经处理过这个事件，跳过
            if (this.contentCache.has(event.id)) {
              continue;
            }

            // 转换为内容对象
            const content: NostrContent = {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
              tags: event.tags,
              source: 'nostr',
            };

            // 添加到结果集
            contents.push(content);

            // 缓存事件 ID
            this.contentCache.add(event.id);
          }
        } catch (error) {
          console.warn(`查询标签 "${tag}" 失败:`, error);
        }
      }

      // 更新最后检索时间为当前时间
      this.lastFetchTime = Math.floor(Date.now() / 1000);

      // 如果缓存过大，移除最旧的项
      while (this.contentCache.size > this.maxCacheSize) {
        const firstItem = Array.from(this.contentCache)[0];
        if (firstItem) this.contentCache.delete(firstItem);
      }

      console.log(`检索到 ${contents.length} 条新内容`);
      return contents;
    } catch (error) {
      console.error('检索 Nostr 内容失败:', error);
      this.emit(NostrContentFetcherEvent.ERROR, error);
      return [];
    }
  }

  /**
   * 开始实时监控内容
   */
  public startMonitoring(): void {
    try {
      console.log('开始 Nostr 内容监控...');

      // 先停止所有现有监控
      this.stopMonitoring();

      // 为每个标签创建过滤器并订阅
      for (const tag of this.monitoredTags) {
        try {
          // 创建过滤器
          const filter = {
            kinds: [1],
            "#t": [tag]
          };

          // 创建订阅处理函数
          const handleEvent = (event: any) => this.handleEvent(event);

          // 创建订阅
          const subscription = this.pool.subscribeMany(
            this.relays,
            [filter],
            { onevent: handleEvent }
          );

          // 保存订阅
          this.subscriptions[`tag:${tag}`] = subscription;

          console.log(`已订阅标签 "${tag}"`);
        } catch (error) {
          console.error(`订阅标签 "${tag}" 失败:`, error);
        }
      }

      console.log('Nostr 实时监控已启动');
    } catch (error) {
      console.error('启动 Nostr 监控失败:', error);
      this.emit(NostrContentFetcherEvent.ERROR, error);
    }
  }

  /**
   * 停止监控
   */
  public stopMonitoring(): void {
    try {
      console.log('停止 Nostr 内容监控...');

      // 关闭所有订阅
      for (const id in this.subscriptions) {
        try {
          const subscription = this.subscriptions[id];
          if (subscription && typeof subscription.close === 'function') {
            subscription.close();
          }
        } catch (e) {
          console.warn(`关闭订阅 ${id} 失败:`, e);
        }
      }

      // 清空订阅对象
      this.subscriptions = {};

      console.log('Nostr 内容监控已停止');
    } catch (error) {
      console.error('停止 Nostr 监控时出错:', error);
      this.emit(NostrContentFetcherEvent.ERROR, error);
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    this.contentCache.clear();
    try {
      if (this.pool) {
        this.pool.close(this.relays);
      }
    } catch (error) {
      console.error('关闭连接池时出错:', error);
    }
  }
}

// 导出全局单例
export const nostrContentFetcher = new NostrContentFetcher(); 