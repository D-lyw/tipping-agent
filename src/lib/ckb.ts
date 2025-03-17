import { ccc } from "@ckb-ccc/core";
import { ClientPublicTestnet, ClientPublicMainnet } from "@ckb-ccc/core";
import { SignerCkbPrivateKey } from "@ckb-ccc/core";
import { Script } from "@ckb-ccc/core";
import { Address } from "@ckb-ccc/core";
import { hashCkb } from "@ckb-ccc/core";

/**
 * 根据私钥生成 CKB 地址
 * @param privateKey 私钥（带或不带0x前缀）
 * @param isTestnet 是否使用测试网络，默认为 false（主网）
 * @returns CKB 地址
 */
const generateAddressByPrivateKey = async (privateKey: string, isTestnet = false) => {
    // 移除可能的 0x 前缀
    const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;

    // 创建客户端（根据网络选择）
    const client = isTestnet ? new ClientPublicTestnet() : new ClientPublicMainnet();
    
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
 * @param isTestnet 是否使用测试网络，默认为 false（主网）
 */
async function transferCKB(privateKey: string, toAddress: string, amount: number, isTestnet = false) {
    // 创建客户端
    const client = isTestnet ? new ClientPublicTestnet() : new ClientPublicMainnet();
    
    // 从私钥创建签名者
    const signer = new SignerCkbPrivateKey(client, privateKey);
    
    // 获取接收方地址对象
    const toAddressObj = await Address.fromString(toAddress, client);
    
    // 创建交易
    const tx = ccc.Transaction.from({
        outputs: [
            {
                lock: toAddressObj.script,
                capacity: ccc.fixedPointFrom(amount), // CKB 转换为 Shannon
            },
        ],
    });

    // 完成交易输入和手续费
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    // 发送交易
    const txHash = await signer.sendTransaction(tx);
    console.log("交易哈希:", txHash);
    return txHash;
}

/**
 * 获取 CKB 余额
 * @param address 地址
 * @param isTestnet 是否使用测试网络，默认为 false（主网）
 * @returns 余额
 */
const getCKBBalance = async (address: string, isTestnet = false) => {
    const client = isTestnet ? new ClientPublicTestnet() : new ClientPublicMainnet();
    const addressObj = await Address.fromString(address, client);
    const balance = await client.getBalance([addressObj.script]);
    return balance;
}

export { generateAddressByPrivateKey, transferCKB, getCKBBalance };