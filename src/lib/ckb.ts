import { ccc } from "@ckb-ccc/core";
import { ClientPublicTestnet, ClientPublicMainnet } from "@ckb-ccc/core";
import { SignerCkbPrivateKey } from "@ckb-ccc/core";
import { Script } from "@ckb-ccc/core";
import { Address } from "@ckb-ccc/core";
import { hashCkb, Transaction, fixedPointFrom } from "@ckb-ccc/core";

// 全局单例的 client 和 signer
let testnetClient: ClientPublicTestnet | null = null;
let mainnetClient: ClientPublicMainnet | null = null;
let testnetSigner: SignerCkbPrivateKey | null = null;
let mainnetSigner: SignerCkbPrivateKey | null = null;

// 用于跟踪当前使用的私钥
let currentTestnetPrivateKey: string | null = null;
let currentMainnetPrivateKey: string | null = null;

/**
 * 获取或创建客户端实例（单例模式）
 * @param isTestnet 是否使用测试网络
 * @returns 客户端实例
 */
function getClient(isTestnet: boolean = true) {
    if (isTestnet) {
        if (!testnetClient) {
            testnetClient = new ClientPublicTestnet();
            console.log('创建新的测试网客户端实例');
        }
        return testnetClient;
    } else {
        if (!mainnetClient) {
            mainnetClient = new ClientPublicMainnet();
            console.log('创建新的主网客户端实例');
        }
        return mainnetClient;
    }
}

/**
 * 获取或创建签名者实例（单例模式）
 * @param privateKey 私钥（带0x前缀）
 * @param isTestnet 是否使用测试网络
 * @returns 签名者实例
 */
function getSigner(privateKey: string, isTestnet: boolean = true) {
    // 确保私钥格式正确（添加0x前缀）
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    if (isTestnet) {
        // 检查私钥是否变更
        if (!testnetSigner || currentTestnetPrivateKey !== formattedPrivateKey) {
            const client = getClient(true);
            testnetSigner = new SignerCkbPrivateKey(client, formattedPrivateKey);
            currentTestnetPrivateKey = formattedPrivateKey;
            console.log(`创建新的测试网签名者，私钥: ${formattedPrivateKey.substring(0, 7)}...`);
        }
        return testnetSigner;
    } else {
        // 检查私钥是否变更
        if (!mainnetSigner || currentMainnetPrivateKey !== formattedPrivateKey) {
            const client = getClient(false);
            mainnetSigner = new SignerCkbPrivateKey(client, formattedPrivateKey);
            currentMainnetPrivateKey = formattedPrivateKey;
            console.log(`创建新的主网签名者，私钥: ${formattedPrivateKey.substring(0, 7)}...`);
        }
        return mainnetSigner;
    }
}

/**
 * 安全序列化函数，处理 BigInt 类型
 * @param obj 要序列化的对象
 * @returns 安全序列化后的字符串
 */
function safeStringify(obj: any): string {
    return JSON.stringify(obj, (_key, value) => 
        typeof value === 'bigint' 
            ? value.toString() 
            : value
    );
}

/**
 * 根据私钥生成 CKB 地址
 * @param privateKey 私钥（带或不带0x前缀）
 * @param isTestnet 是否使用测试网络，默认为 false（主网）
 * @returns CKB 地址
 */
const generateAddressByPrivateKey = async (privateKey: string, isTestnet = false) => {
    // 移除可能的 0x 前缀
    const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    // 获取单例客户端
    const client = getClient(isTestnet);
    
    // 从私钥创建签名者
    const signer = new SignerCkbPrivateKey(client, '0x' + cleanPrivateKey);
    
    // 获取地址
    return await signer.getInternalAddress();
}

/**
 * 转账 CKB
 * @param privateKey 发送方私钥
 * @param toAddress 接收方地址
 * @param amount 金额（CKB单位）
 * @param isTestnet 是否使用测试网络，默认为 true（测试网）
 */
async function transferCKB(privateKey: string, toAddress: string, amount: number, isTestnet = true) {
    try {
        console.log('transferCKB 开始执行...');
        
        // 获取单例的客户端和签名者
        const client = getClient(isTestnet);
        const signer = getSigner(privateKey, isTestnet);
        
        // 获取接收方地址对象
        console.log(`正在解析接收方地址: ${toAddress.substring(0, 10)}...`);
        const toAddressObj = await Address.fromString(toAddress, client);
        
        // 验证金额有效性
        if (amount <= 0) {
            throw new Error(`无效的转账金额: ${amount}`);
        }
        
        // 创建交易
        console.log(`正在创建交易，金额: ${amount} CKB`);
        // 确保所有参数都有效
        if (!toAddressObj || !toAddressObj.script) {
            throw new Error('无效的接收方地址对象');
        }
        
        // 使用更安全的方式创建交易
        const capacity = fixedPointFrom(amount); // CKB 转换为 Shannon
        const txOutputs = [{
            lock: toAddressObj.script,
            capacity: capacity,
        }];
        
        // 使用自定义 replacer 函数处理 BigInt 序列化
        try {
            // 尝试使用安全序列化打印输出详情
            console.log('交易输出详情:', safeStringify({
                lockType: toAddressObj.script.codeHash,
                amount: amount,
                capacity: capacity.toString()
            }));
        } catch (error) {
            // 如果仍然失败，使用更简单的日志
            console.log('交易输出详情: 无法序列化，金额:', amount, 'CKB');
        }
        
        const tx = Transaction.from({ outputs: txOutputs });

        // 完成交易输入和手续费
        console.log('正在完成交易输入...');
        await tx.completeInputsByCapacity(signer);
        
        console.log('正在计算手续费...');
        await tx.completeFeeBy(signer);

        // 发送交易
        console.log('正在发送交易...');
        const txHash = await signer.sendTransaction(tx);
        console.log("交易发送成功，哈希:", txHash);
        return txHash;
    } catch (error) {
        console.error('transferCKB 执行失败:', error);
        throw error;
    }
}

/**
 * 获取 CKB 余额
 * @param address 地址
 * @param isTestnet 是否使用测试网络，默认为 false（主网）
 * @returns 余额
 */
const getCKBBalance = async (address: string, isTestnet = false) => {
    // 获取单例客户端
    const client = getClient(isTestnet);
    const addressObj = await Address.fromString(address, client);
    const balance = await client.getBalance([addressObj.script]);
    return balance;
}

export { generateAddressByPrivateKey, transferCKB, getCKBBalance };