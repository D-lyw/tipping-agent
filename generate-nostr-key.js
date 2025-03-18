// 生成 Nostr 私钥工具
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { bytesToHex } from '@noble/hashes/utils'

// 生成新的私钥
const sk = generateSecretKey()
const skHex = bytesToHex(sk)
const pk = getPublicKey(sk)

console.log('----------- Nostr 密钥对 -----------')
console.log(`私钥: ${skHex}`)
console.log(`公钥: ${pk}`)
console.log('-----------------------------------')
console.log('将私钥添加到 .env 文件的 NOSTR_PRIVATE_KEY 变量中')
console.log('提示: 私钥要妥善保存，不要分享给他人！') 