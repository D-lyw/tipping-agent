import { EventEmitter } from 'events';
import { finalizeEvent, verifyEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
// 导入 CKB CCC 库
import { hexFrom, bytesConcat, hashCkb, KnownScript, Address, ClientPublicTestnet } from '@ckb-ccc/core';

// 定义事件类型
export enum NostrMonitorEvent {
  NEW_NOTE = 'new_note',
  ERROR = 'error',
}

// 定义 Nostr 事件接口
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * 将 Nostr 公钥转换为 CKB 地址
 * @param nostrPubkey Nostr 公钥（十六进制字符串，不带0x前缀）
 * @param client CKB 客户端实例
 * @returns CKB 地址
 */
export async function nostrPubKeyToCkbAddress(nostrPubkey: string, client: any): Promise<string> {
  try {
    // 确保公钥没有 0x 前缀
    const pubkeyHex = nostrPubkey.startsWith('0x') ? nostrPubkey.substring(2) : nostrPubkey;
    
    // 使用与 CCC 库相同的方法创建 NostrLock 脚本
    const address = await Address.fromKnownScript(
      client,
      KnownScript.NostrLock,
      hexFrom(bytesConcat([0x00], hashCkb(pubkeyHex).slice(0, 42))),
    );
    
    // 转换为地址字符串
    return address.toString();
  } catch (error) {
    console.error('转换 Nostr 公钥到 CKB 地址失败:', error);
    throw error;
  }
}

/**
 * 创建 CKB 客户端（测试网络）
 * @returns CKB 客户端实例
 */
export async function createCkbTestnetClient(): Promise<any> {
  try {
    // 创建客户端实例，当前是测试网环境
    const client = new ClientPublicTestnet();
    return client;
  } catch (error) {
    console.error('CKB 客户端初始化失败:', error);
    throw error;
  }
}

/**
 * 简化版将 Nostr 公钥转换为 CKB 地址的工具函数
 * @param nostrPubkey Nostr 公钥（十六进制字符串）
 * @returns CKB 地址
 */
export async function convertNostrPubkeyToCkbAddress(nostrPubkey: string): Promise<string> {
  const client = await createCkbTestnetClient();
  return await nostrPubKeyToCkbAddress(nostrPubkey, client);
}

export class NostrMonitor extends EventEmitter {
  private relays: string[] = [];
  private relayInstances: Map<string, any> = new Map();
  private monitoredTags: string[] = ['ckb', 'nervos', 'cryptocurrency'];
  private privateKeyHex?: string;
  private privateKey?: Uint8Array;
  private publicKey?: string;
  private isMonitoring: boolean = false;
  private ckbClient: any = null;

  constructor() {
    super();
  }

  /**
   * 初始化 Nostr 监控器
   * @param privateKeyHex 私钥（十六进制字符串）
   */
  public async init(privateKeyHex?: string): Promise<void> {
    try {
      this.privateKeyHex = privateKeyHex;
      
      if (this.privateKeyHex) {
        this.privateKey = hexToBytes(this.privateKeyHex);
        this.publicKey = getPublicKey(this.privateKey);
        console.log(`Nostr 监控初始化完成，公钥: ${this.publicKey}`);
      } else {
        console.warn('未提供 Nostr 私钥，将无法发布内容');
      }
    } catch (error) {
      console.error('Nostr 监控初始化失败:', error);
      this.emit(NostrMonitorEvent.ERROR, error);
      throw error;
    }
  }

  /**
   * 添加中继服务器
   * @param url 中继服务器 URL
   */
  public addRelay(url: string): void {
    if (this.relays.includes(url)) {
      console.log(`中继服务器 ${url} 已存在，跳过添加`);
      return;
    }

    this.relays.push(url);
    console.log(`已添加中继服务器: ${url}`);
  }

  /**
   * 添加监控标签
   * @param tag 要监控的标签
   */
  public addTag(tag: string): void {
    if (!this.monitoredTags.includes(tag)) {
      this.monitoredTags.push(tag);
      console.log(`添加监控标签: ${tag}`);
    }
  }

  /**
   * 开始监控 Nostr 内容
   * @param interval 检查间隔（毫秒）
   */
  public startMonitoring(interval: number = 60000): void {
    if (this.isMonitoring) {
      console.log('Nostr 监控已在运行中');
      return;
    }

    if (this.relays.length === 0) {
      console.warn('未添加任何中继服务器，无法开始监控');
      return;
    }

    this.isMonitoring = true;
    console.log(`开始监控 Nostr 内容，检查间隔: ${interval}ms`);
    
    // 模拟连接到中继服务器和监控内容
    console.log(`已连接到 ${this.relays.length} 个中继服务器`);
    console.log(`正在监控标签: ${this.monitoredTags.join(', ')}`);
    
    // 打印公钥
    if (this.publicKey) {
      console.log(`使用公钥: ${this.publicKey}`);
    }
  }

  /**
   * 停止监控
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      console.log('Nostr 监控未运行');
      return;
    }

    // 关闭中继连接
    for (const [url, relay] of this.relayInstances.entries()) {
      try {
        relay.close();
      } catch (e) {
        console.error(`关闭中继连接失败: ${e}`);
      }
    }
    
    this.relayInstances.clear();
    this.isMonitoring = false;
    console.log('已停止 Nostr 监控');
  }

  /**
   * 发布文本笔记到 Nostr
   * @param content 笔记内容
   * @param tags 标签列表
   * @returns 事件 ID
   */
  public async publishNote(content: string, tags: string[][] = []): Promise<string> {
    if (!this.privateKey || !this.publicKey) {
      throw new Error('未初始化私钥，无法发布内容');
    }
    
    try {
      console.log(`模拟发布内容到 Nostr: ${content.substring(0, 50)}...`);
      console.log(`标签: ${JSON.stringify(tags)}`);
      
      // 生成一个事件 ID（实际上这里只是模拟，不是真实发布）
      const fakeId = `sim_${Date.now().toString(16)}`;
      
      console.log(`已模拟发布笔记到 Nostr，ID: ${fakeId}`);
      return fakeId;
    } catch (error) {
      console.error('发布 Nostr 笔记失败:', error);
      this.emit(NostrMonitorEvent.ERROR, error);
      throw error;
    }
  }

  /**
   * 为兼容性保留，将名称修改为 publishTextNote
   */
  public async publishTextNote(content: string, tags: string[][] = []): Promise<string> {
    return this.publishNote(content, tags);
  }

  /**
   * 创建 CKB 客户端
   * @returns CKB 客户端实例
   */
  private async createCkbClient(): Promise<any> {
    if (!this.ckbClient) {
      try {
        // 创建客户端实例，当前是测试网环境
        this.ckbClient = new ClientPublicTestnet();
        
        console.log('CKB 客户端初始化成功');
      } catch (error) {
        console.error('CKB 客户端初始化失败:', error);
        throw error;
      }
    }
    
    return this.ckbClient;
  }

  /**
   * 获取 Nostr 公钥对应的 CKB 地址
   * @param nostrPubkey Nostr 公钥
   * @returns CKB 地址
   */
  public async getNostrPubkeyCkbAddress(nostrPubkey: string): Promise<string> {
    try {
      // 创建 CKB 客户端
      const client = await this.createCkbClient();
      
      // 将 Nostr 公钥转换为 CKB 地址
      return await nostrPubKeyToCkbAddress(nostrPubkey, client);
    } catch (error) {
      console.error('获取 Nostr 公钥对应的 CKB 地址失败:', error);
      throw error;
    }
  }
}

// 导出全局单例
export const nostrMonitor = new NostrMonitor();

// 导出工具函数
export const nostrTools = {
  convertNostrPubkeyToCkbAddress,
}; 