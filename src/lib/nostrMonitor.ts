import { EventEmitter } from 'events';
import { finalizeEvent, verifyEvent, getPublicKey } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { hexToBytes } from '@noble/hashes/utils';
// 导入 CKB CCC 库
import { hexFrom, bytesConcat, hashCkb, KnownScript, Address, ClientPublicTestnet } from '@ckb-ccc/core';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 定义事件类型
export enum NostrClientEvent {
    NEW_NOTE = 'new_note',
    RELAY_CONNECTED = 'relay_connected',
    RELAY_DISCONNECTED = 'relay_disconnected',
    ERROR = 'error',
}

// 定义未签名的 Nostr 事件接口
export interface UnsignedEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey: string;
}

// 定义已签名的 Nostr 事件接口
export interface NostrEvent extends UnsignedEvent {
    id: string;
    sig: string;
}

// 定义客户端配置接口
export interface NostrClientConfig {
    privateKey: string; // 必须提供私钥
    relays?: string[];  // 可选的中继服务器列表
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

/**
 * Nostr 客户端类 - 提供与 Nostr 网络交互的功能
 */
export class NostrClient extends EventEmitter {
    private relays: string[] = [];
    private relayInstances: Map<string, any> = new Map();
    private privateKeyHex: string;
    private privateKey: Uint8Array;
    private publicKey: string;      // 十六进制格式公钥
    private publicKeyBech32: string; // Bech32 格式的 npub 公钥
    private ckbClient: any = null;
    private connected: boolean = false;
    private pool: SimplePool;  // nostr-tools 的 SimplePool 实例

    /**
     * 构造函数 - 初始化 Nostr 客户端
     * @param config 客户端配置，必须包含私钥
     */
    constructor(config: NostrClientConfig) {
        super();

        if (!config.privateKey) {
            throw new Error('必须提供 Nostr 私钥才能初始化客户端');
        }

        // 初始化 SimplePool
        this.pool = new SimplePool();
        
        // 保存中继服务器列表
        if (config.relays && config.relays.length > 0) {
            this.relays = [...config.relays];
        }
        
        let privateKeyHex = '';
        
        // 处理不同格式的私钥
        if (config.privateKey.startsWith('nsec')) {
            try {
                // 使用 nip19 解码 nsec 格式私钥
                const decoded = nip19.decode(config.privateKey);
                if (decoded.type !== 'nsec') {
                    throw new Error(`期望 nsec 类型，但获取到 ${decoded.type}`);
                }
                
                // nsec 解码后是十六进制字符串
                if (typeof decoded.data === 'string') {
                    privateKeyHex = decoded.data;
                } 
                // 或者可能是 Uint8Array，需要转换为十六进制
                else if (decoded.data instanceof Uint8Array) {
                    privateKeyHex = Array.from(decoded.data)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                }
                else {
                    throw new Error('解码后的数据格式不支持');
                }
            } catch (error) {
                console.error('解码 nsec 格式私钥失败:', error);
                throw new Error('无效的 nsec 格式私钥');
            }
        } else if (config.privateKey.startsWith('0x')) {
            // 如果是 0x 开头的十六进制格式
            privateKeyHex = config.privateKey.substring(2);
        } else {
            // 假设是普通的十六进制格式
            privateKeyHex = config.privateKey;
        }
        
        // 清理私钥，确保只包含有效的十六进制字符
        this.privateKeyHex = privateKeyHex.replace(/[^0-9a-f]/gi, '');
            
        // 确保私钥长度正确
        if (this.privateKeyHex.length !== 64) {
            // 补全或截断私钥以匹配正确长度
            if (this.privateKeyHex.length < 64) {
                console.warn(`警告: 私钥长度不足(${this.privateKeyHex.length}/64)，将自动补0`);
                this.privateKeyHex = this.privateKeyHex.padStart(64, '0');
            } else {
                console.warn(`警告: 私钥长度过长(${this.privateKeyHex.length}/64)，将自动截断`);
                this.privateKeyHex = this.privateKeyHex.substring(0, 64);
            }
        }
            
        // 确保私钥是有效的十六进制字符串
        if (!/^[0-9a-f]{64}$/i.test(this.privateKeyHex)) {
            throw new Error('私钥必须是有效的十六进制字符串');
        }
            
        try {
            this.privateKey = hexToBytes(this.privateKeyHex);
            this.publicKey = getPublicKey(this.privateKey);
            // 创建 Bech32 格式的 npub 公钥
            this.publicKeyBech32 = nip19.npubEncode(this.publicKey);
        } catch (error) {
            console.error('处理私钥时出错:', error);
            throw new Error('无法处理私钥，请确保提供了有效的Nostr私钥');
        }

        // 简单日志，仅记录初始化完成状态
        console.log(`Nostr 客户端初始化完成`);
    }

    /**
     * 添加中继服务器
     * @param url 中继服务器 URL
     */
    public addRelay(url: string): void {
        if (this.relays.includes(url)) {
            return;
        }

        this.relays.push(url);
        
        // 如果已连接，则连接到新添加的中继
        if (this.connected) {
            this.connectToRelay(url);
        }
    }

    /**
     * 连接到指定的中继服务器
     * @param url 中继服务器 URL
     * @private
     */
    private async connectToRelay(url: string): Promise<void> {
        try {
            // 尝试主动连接到中继，SimplePool 会在需要时自动连接
            // 我们直接添加到跟踪列表中，并在后续操作中检测是否连接成功
            
            // 无论连接测试成功与否，都添加到中继实例列表
            if (!this.relayInstances.has(url)) {
                this.relayInstances.set(url, url);
                this.emit(NostrClientEvent.RELAY_CONNECTED, url);
            }
        } catch (error) {
            console.error(`连接到中继 ${url} 失败:`, error);
            throw error;
        }
    }

    /**
     * 连接到所有配置的中继服务器
     */
    public async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        if (this.relays.length === 0) {
            console.warn('未添加任何中继服务器，无法连接');
            return;
        }
        
        // 连接到所有中继
        for (const url of this.relays) {
            await this.connectToRelay(url);
        }
        
        this.connected = true;
    }

    /**
     * 断开与所有中继服务器的连接
     */
    public disconnect(): void {
        if (!this.connected) {
            return;
        }

        // 关闭所有中继连接
        try {
            this.pool.close(Array.from(this.relayInstances.keys()));
            
            // 清理中继实例映射
            this.relayInstances.clear();
            this.connected = false;
            
            // 触发事件
            this.emit(NostrClientEvent.RELAY_DISCONNECTED, 'all');
        } catch (e) {
            console.error('关闭中继连接失败:', e);
        }
    }

    /**
     * 发布文本笔记到 Nostr
     * @param content 笔记内容
     * @param tags 标签列表
     * @returns 事件 ID
     */
    public async publishNote(content: string, tags: string[][] = []): Promise<string> {
        try {
            // 创建事件对象
            const unsignedEvent: UnsignedEvent = {
                kind: 1,                              // 文本笔记类型
                created_at: Math.floor(Date.now() / 1000),  // 当前时间戳（秒）
                tags: tags,                           // 标签
                content: content,                     // 笔记内容
                pubkey: this.publicKey                // 发布者公钥（使用十六进制格式）
            };

            // 使用私钥签名事件
            const signedEvent = finalizeEvent(unsignedEvent, this.privateKey) as NostrEvent;

            // 验证签名
            const verified = verifyEvent(signedEvent);
            if (!verified) {
                throw new Error('事件签名验证失败');
            }

            // 确保中继列表不为空
            if (this.relayInstances.size === 0) {
                // 如果还没有中继，尝试连接
                if (this.relays.length > 0) {
                    await this.connect();
                    
                    // 连接后等待一段时间，确保连接稳定
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    throw new Error('没有可用的中继服务器');
                }
            }

            // 发布到所有中继服务器
            const relayUrls = Array.from(this.relayInstances.keys());
            
            try {
                // 使用 Promise.any 来确保只要有一个中继成功发布即可
                try {
                    await Promise.any(this.pool.publish(relayUrls, signedEvent));
                    
                    // 现在尝试获取所有发布结果
                    const allResults = await Promise.allSettled(this.pool.publish(relayUrls, signedEvent));
                    
                    let successCount = 0;
                    
                    // 统计成功的中继数量
                    for (let i = 0; i < relayUrls.length && i < allResults.length; i++) {
                        if (allResults[i].status === 'fulfilled') {
                            successCount++;
                        }
                    }
                    
                    return signedEvent.id;
                } catch (publishError) {
                    console.error('所有中继发布均失败:', publishError);
                    throw new Error('所有中继发布均失败');
                }
            } catch (pubError) {
                console.error('发布过程中出错:', pubError);
                
                // 尝试直接发送到一个已知稳定的中继
                // 创建一个更稳定的中继备选列表
                const fallbackRelays = ['wss://relay.snort.social', 'wss://purplepag.es', 'wss://relay.nos.social'];
                
                try {
                    // 尝试使用备选中继发布
                    try {
                        await Promise.any(this.pool.publish(fallbackRelays, signedEvent));
                        return signedEvent.id;
                    } catch (fallbackPubError) {
                        console.error('使用备选中继发布也失败了:', fallbackPubError);
                        throw new Error('使用备选中继发布也失败了');
                    }
                } catch (fallbackError) {
                    console.error('备选发布方法也失败:', fallbackError);
                    throw fallbackError;
                }
            }
        } catch (error) {
            console.error('发布 Nostr 笔记失败:', error);
            this.emit(NostrClientEvent.ERROR, error);
            throw error;
        }
    }

    /**
     * 回复特定 Nostr 事件（笔记）
     * @param eventId 要回复的事件 ID (十六进制或 note1 格式)
     * @param pubkey 事件作者的公钥 (十六进制或 npub1 格式)
     * @param content 回复内容
     * @param additionalTags 额外的标签
     * @returns 回复事件 ID
     */
    public async replyToNote(
        eventId: string,
        pubkey: string,
        content: string,
        additionalTags: string[][] = []
    ): Promise<string> {
        try {
            // 处理可能的 NIP-19 格式 (note1, npub1)
            const hexEventId = eventId.startsWith('note1') ? decodeNip19(eventId) : eventId;
            
            // 处理作者公钥，可能是 npub1 格式
            const hexPubkey = pubkey.startsWith('npub1') ? decodeNip19(pubkey) : pubkey;
            
            // 创建包含引用关系的标签
            // e 标签用于引用事件，正确格式: ["e", "事件ID"]
            // p 标签用于引用公钥，正确格式: ["p", "公钥"]
            const replyTags: string[][] = [
                ["e", hexEventId],  // 标记这是对特定事件的回复
                ["p", hexPubkey]    // 引用原始作者的公钥
            ];

            // 合并额外标签
            const allTags = [...replyTags, ...additionalTags];

            // 使用 publishNote 方法发布回复
            return await this.publishNote(content, allTags);
        } catch (error) {
            console.error('发布 Nostr 回复失败:', error);
            this.emit(NostrClientEvent.ERROR, error);
            throw error;
        }
    }

    /**
     * 转发特定 Nostr 事件（笔记）- 在 Nostr 中称为 Repost
     * @param eventId 要转发的事件 ID (十六进制或 note1 格式)
     * @param pubkey 事件作者的公钥 (十六进制或 npub1 格式)
     * @param comment 转发时添加的评论（可选）
     * @param additionalTags 额外的标签
     * @returns 转发事件 ID
     */
    public async retweetNote(
        eventId: string,
        pubkey: string,
        comment: string = '',
        additionalTags: string[][] = []
    ): Promise<string> {
        try {
            // 处理可能的 NIP-19 格式 (note1, npub1)
            const hexEventId = eventId.startsWith('note1') ? decodeNip19(eventId) : eventId;
            
            // 处理作者公钥，可能是 npub1 格式
            const hexPubkey = pubkey.startsWith('npub1') ? decodeNip19(pubkey) : pubkey;
            
            // 创建转发标签
            // 使用 ["e", eventId, "", "mention"] 表示提及
            // 使用 ["e", eventId, "", "root"] 表示根事件
            // 使用 ["p", pubkey] 引用原始作者
            const retweetTags: string[][] = [
                ["e", hexEventId, "", "mention"],  // 提及原始事件
                ["p", hexPubkey]                   // 引用原始作者
            ];

            // 如果这是一个直接转发（没有评论），使用 kind=6 的纯转发类型
            if (!comment || comment.trim() === '') {
                // 创建特定的转发标签
                const pureRetweetTags = [
                    ["e", hexEventId],  // 引用被转发事件
                    ["p", hexPubkey],   // 引用原始作者
                    ["k", "1"]          // 表明转发的是 kind 1 的事件（普通文本笔记）
                ];
                
                // 合并额外标签
                const allTags = [...pureRetweetTags, ...additionalTags];

                // 创建无内容的转发事件
                const unsignedEvent: UnsignedEvent = {
                    kind: 6,                              // 转发类型
                    created_at: Math.floor(Date.now() / 1000),  // 当前时间戳（秒）
                    tags: allTags,                        // 标签
                    content: "",                          // 转发无需内容
                    pubkey: this.publicKey                // 发布者公钥
                };

                // 使用私钥签名事件
                const signedEvent = finalizeEvent(unsignedEvent, this.privateKey) as NostrEvent;

                // 验证签名
                const verified = verifyEvent(signedEvent);
                if (!verified) {
                    throw new Error('事件签名验证失败');
                }

                // 发布到所有中继服务器
                const relayUrls = Array.from(this.relayInstances.keys());
                
                try {
                    await Promise.any(this.pool.publish(relayUrls, signedEvent));
                    return signedEvent.id;
                } catch (error) {
                    console.error('转发发布失败:', error);
                    throw error;
                }
            } else {
                // 有评论的转发，使用 kind=1 的普通笔记，并添加适当的引用标签
                // 合并额外标签
                const allTags = [...retweetTags, ...additionalTags];

                // 使用 publishNote 方法发布带评论的转发
                return await this.publishNote(comment, allTags);
            }
        } catch (error) {
            console.error('转发 Nostr 笔记失败:', error);
            this.emit(NostrClientEvent.ERROR, error);
            throw error;
        }
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
     * @param nostrPubkey Nostr 公钥 (十六进制或 npub1 格式)
     * @returns CKB 地址
     */
    public async getNostrPubkeyCkbAddress(nostrPubkey: string): Promise<string> {
        try {
            // 处理可能的 npub1 格式公钥
            const hexPubkey = nostrPubkey.startsWith('npub1') ? decodeNip19(nostrPubkey) : nostrPubkey;
            
            // 创建 CKB 客户端
            const client = await this.createCkbClient();

            // 将 Nostr 公钥转换为 CKB 地址
            return await nostrPubKeyToCkbAddress(hexPubkey, client);
        } catch (error) {
            console.error('获取 Nostr 公钥对应的 CKB 地址失败:', error);
            throw error;
        }
    }

    /**
     * 获取当前客户端的公钥
     * @returns Nostr 公钥
     */
    public getPublicKey(): string {
        return this.publicKeyBech32; // 返回 npub 格式的公钥
    }

    /**
     * 获取当前客户端的十六进制格式公钥
     * @returns 十六进制格式的 Nostr 公钥
     */
    public getPublicKeyHex(): string {
        return this.publicKey; // 返回十六进制格式的公钥
    }

    /**
     * 获取当前客户端的 CKB 地址
     * @returns CKB 地址
     */
    public async getCurrentCkbAddress(): Promise<string> {
        return await this.getNostrPubkeyCkbAddress(this.publicKey);
    }
}

// 导出全局单例，但必须在使用前设置私钥
const privateKey = process.env.NOSTR_PRIVATE_KEY || '';
const relaysString = process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.nostr.info,wss://nos.lol';
const relays = relaysString.split(',').map(relay => relay.trim());

export const nostrClient = new NostrClient({ 
    privateKey: privateKey,
    relays: relays
});

/**
 * 解码 NIP-19 格式的 Nostr 标识符
 * @param nip19Str NIP-19 格式的字符串 (如 npub, nprofile 等)
 * @returns 解码后的公钥或相关信息
 */
export function decodeNip19(nip19Str: string): string {
    try {
        // 如果已经是十六进制公钥格式，直接返回
        if (/^[0-9a-f]{64}$/i.test(nip19Str)) {
            return nip19Str;
        }

        // 使用 nostr-tools 的 nip19 模块解码
        if (nip19Str.startsWith('npub1')) {
            // 解码 npub 格式（公钥）
            const { data } = nip19.decode(nip19Str) as { type: 'npub', data: string };
            return data;
        }
        else if (nip19Str.startsWith('nprofile1')) {
            // 解码 nprofile 格式（包含公钥和其他元数据）
            const { data } = nip19.decode(nip19Str) as {
                type: 'nprofile',
                data: { pubkey: string; relays?: string[] }
            };
            return data.pubkey;
        }
        else if (nip19Str.startsWith('note1')) {
            // 解码 note 格式（事件 ID）
            const { data } = nip19.decode(nip19Str) as { type: 'note', data: string };
            return data;
        }
        else if (nip19Str.startsWith('nevent1')) {
            // 解码 nevent 格式（事件 ID 和其他元数据）
            const { data } = nip19.decode(nip19Str) as {
                type: 'nevent',
                data: { id: string; relays?: string[] }
            };
            return data.id;
        }

        // 尝试通用解码
        try {
            const decoded = nip19.decode(nip19Str);

            // 根据解码结果类型返回相应的值
            if (typeof decoded.data === 'string') {
                return decoded.data;
            } else if (typeof decoded.data === 'object') {
                // 检查是否是 ProfilePointer (有 pubkey 属性)
                if ('pubkey' in decoded.data) {
                    return (decoded.data as { pubkey: string }).pubkey;
                }
                // 检查是否是 EventPointer (有 id 属性)
                else if ('id' in decoded.data) {
                    return (decoded.data as { id: string }).id;
                }
            }

            throw new Error(`无法从解码结果中提取公钥或 ID: ${JSON.stringify(decoded)}`);
        } catch (innerError: any) {
            throw new Error(`无法解码 NIP-19 格式 "${nip19Str}": ${innerError.message}`);
        }
    } catch (error) {
        console.error('解码 NIP-19 字符串失败:', error);
        throw error;
    }
}

/**
 * 增强版将 Nostr 公钥转换为 CKB 地址的工具函数
 * @param nostrIdentifier Nostr 公钥或 NIP-19 格式的标识符
 * @returns CKB 地址
 */
export async function convertNostrIdentifierToCkbAddress(nostrIdentifier: string): Promise<string> {
    try {
        // 尝试解码 NIP-19 格式（如果是）
        let pubkey = nostrIdentifier;
        if (nostrIdentifier.startsWith('n')) {
            pubkey = decodeNip19(nostrIdentifier);
        }

        // 使用解码后的公钥进行转换
        const client = await createCkbTestnetClient();
        return await nostrPubKeyToCkbAddress(pubkey, client);
    } catch (error) {
        console.error('转换 Nostr 标识符到 CKB 地址失败:', error);
        throw error;
    }
}

// 添加工具函数
export const nostrTools = {
    convertNostrPubkeyToCkbAddress,
    convertNostrIdentifierToCkbAddress,
    decodeNip19,
    
    // 测试中继连接
    testRelayConnection: async (relay: string): Promise<boolean> => {
        const pool = new SimplePool();
        
        try {
            // 尝试简单的查询接收对象来测试连接
            // 使用 subscribeMany 而不是过时的 sub 方法
            const sub = pool.subscribeMany(
                [relay], 
                [{ kinds: [1], limit: 1 }],
                { 
                    onevent: () => {
                        connectionOk = true;
                    },
                    oneose: () => {
                        connectionOk = true;
                        // 不需要手动调用 unsub，使用 close 即可
                    }
                }
            );
            
            // 设置超时和等待处理
            let connectionOk = false;
            
            // 设置超时
            await new Promise<void>(resolve => {
                setTimeout(() => {
                    // 关闭这个订阅
                    sub.close();
                    resolve();
                }, 3000);
            });
            
            // 等待额外的时间确保连接稳定
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (connectionOk) {
                pool.close([relay]);
                return true;
            } else {
                pool.close([relay]);
                return false;
            }
        } catch (error) {
            console.error(`测试中继连接失败: ${error}`);
            try {
                pool.close([relay]);
            } catch (closeError) {
                console.error(`关闭连接失败: ${closeError}`);
            }
            return false;
        }
    },
    
    // 测试所有配置的中继
    testAllRelays: async (): Promise<{[key: string]: boolean}> => {
        const relaysStr = process.env.NOSTR_RELAYS || '';
        const relays = relaysStr.split(',').map(r => r.trim()).filter(r => r);
        
        const results: {[key: string]: boolean} = {};
        
        for (const relay of relays) {
            results[relay] = await nostrTools.testRelayConnection(relay);
        }
        
        return results;
    }
}; 