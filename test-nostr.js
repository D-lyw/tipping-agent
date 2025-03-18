// 简单的 Nostr 测试工具，不依赖其他模块
import { finalizeEvent, verifyEvent, getPublicKey } from 'nostr-tools'
import { SimplePool } from 'nostr-tools/pool'
import { hexToBytes } from '@noble/hashes/utils'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('启动 Nostr 测试工具...')
  
  try {
    // 初始化
    const pool = new SimplePool()
    const relaysStr = process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://relay.nostr.info'
    const relays = relaysStr.split(',').map(relay => relay.trim())
    const privateKeyHex = process.env.NOSTR_PRIVATE_KEY
    
    if (!privateKeyHex) {
      console.error('请在 .env 文件中设置 NOSTR_PRIVATE_KEY')
      return
    }
    
    // 从私钥获取公钥
    const privateKey = hexToBytes(privateKeyHex)
    const publicKey = getPublicKey(privateKey)
    console.log(`公钥: ${publicKey}`)
    
    // 连接到 relays
    console.log(`连接到 relays: ${relays.join(', ')}`)
    
    // 监听消息
    console.log('开始监听包含 CKB、Nervos 标签的消息...')
    const sub = pool.sub(relays, [{ kinds: [1], "#t": ["ckb", "nervos"] }])
    
    sub.on('event', event => {
      console.log(`收到事件: ${event.id.slice(0, 10)}... (${new Date(event.created_at * 1000).toISOString()})`)
      console.log(`作者: ${event.pubkey.slice(0, 10)}...`)
      console.log(`内容: ${event.content.slice(0, 100)}${event.content.length > 100 ? '...' : ''}`)
      console.log('-'.repeat(40))
    })
    
    // 发布测试消息
    if (process.argv.includes('--publish')) {
      console.log('准备发布测试消息...')
      
      // 创建事件
      let event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', 'ckb'],
          ['t', 'nervos'],
          ['t', 'test']
        ],
        content: `这是一条 CKB Nostr 测试消息 ${new Date().toISOString()}`,
        pubkey: publicKey
      }
      
      // 签名事件
      event = finalizeEvent(event, privateKey)
      
      // 验证签名
      const verified = verifyEvent(event)
      console.log(`事件签名验证: ${verified ? '成功' : '失败'}`)
      
      if (verified) {
        // 发布
        console.log('发布事件...')
        const pubs = pool.publish(relays, event)
        
        // 等待发布结果
        Promise.allSettled(pubs).then(results => {
          console.log('发布结果:')
          results.forEach((result, i) => {
            console.log(`- ${relays[i]}: ${result.status}`)
          })
        })
      } else {
        console.error('事件签名验证失败，无法发布')
      }
    }
    
    console.log('按 Ctrl+C 退出')
  } catch (error) {
    console.error('发生错误:', error)
  }
}

main() 