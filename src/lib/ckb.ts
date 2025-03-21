import { ccc } from "@ckb-ccc/core";
import { ClientPublicTestnet } from "@ckb-ccc/core";
import { SignerCkbPrivateKey } from "@ckb-ccc/core";
import { Script } from "@ckb-ccc/core";
import { Address } from "@ckb-ccc/core";
import { hashCkb, Transaction, fixedPointFrom } from "@ckb-ccc/core";

// 全局单例的 client 和 signer
let testnetClient: ClientPublicTestnet | null = null;
let testnetSigner: SignerCkbPrivateKey | null = null;

/**
 * 获取测试网客户端实例（单例模式）
 * @returns 测试网客户端实例
 */
function getTestnetClient() {
    if (!testnetClient) {
        testnetClient = new ClientPublicTestnet();
        console.log('创建新的测试网客户端实例');
    }
    return testnetClient;
}

/**
 * 获取测试网签名者实例（单例模式）
 * 从环境变量获取私钥
 * @returns 测试网签名者实例
 */
function getTestnetSigner() {
    // 从环境变量获取私钥
    const privateKey = process.env.CKB_PRIVATE_KEY;
    
    if (!privateKey) {
        throw new Error('环境变量 CKB_PRIVATE_KEY 未设置');
    }
    
    // 确保私钥格式正确（添加0x前缀）
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    // 如果签名者不存在，或者私钥已更改，则创建新的签名者
    if (!testnetSigner) {
        const client = getTestnetClient();
        testnetSigner = new SignerCkbPrivateKey(client, formattedPrivateKey);
        console.log(`创建新的测试网签名者，私钥: ${formattedPrivateKey.substring(0, 7)}...`);
    }
    
    return testnetSigner;
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
 * 根据环境变量私钥生成 CKB 地址
 * @returns CKB 地址
 */
const generateTestnetAddress = async () => {
    // 获取签名者实例
    const signer = getTestnetSigner();
    
    // 获取地址
    return await signer.getInternalAddress();
}

/**
 * 转账 CKB（使用环境变量中的私钥）
 * @param toAddress 接收方地址
 * @param amount 金额（CKB单位）
 */
async function transferCKB(toAddress: string, amount: number) {
    try {
        console.log('transferCKB 开始执行...');
        
        // 获取单例的客户端和签名者
        const client = getTestnetClient();
        const signer = getTestnetSigner();
        
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
 * @returns 余额
 */
const getCKBBalance = async (address: string) => {
    // 获取单例客户端
    const client = getTestnetClient();
    const addressObj = await Address.fromString(address, client);
    const balance = await client.getBalance([addressObj.script]);
    return balance;
}

export { generateTestnetAddress, transferCKB, getCKBBalance };