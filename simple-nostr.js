// 简化的 Nostr 测试工具
import { finalizeEvent, verifyEvent, getPublicKey } from 'nostr-tools'
import { Relay } from 'nostr-tools/relay'
import { hexToBytes } from '@noble/hashes/utils'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('启动简化版 Nostr 测试工具...')
  
  try {
    // 获取配置
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
    
    // 连接到第一个 relay
    console.log(`连接到 relay: ${relays[0]}`)
    const relay = await Relay.connect(relays[0])
    console.log('连接成功!')
    
    // 监听事件
    console.log('开始监听...')
    
    // 定义事件处理函数
    const handleEvent = (event) => {
      console.log(`收到事件: ${event.id.slice(0, 10)}... (${new Date(event.created_at * 1000).toISOString()})`)
      console.log(`作者: ${event.pubkey.slice(0, 10)}...`)
      console.log(`内容: ${event.content.slice(0, 100)}${event.content.length > 100 ? '...' : ''}`)
      console.log('-'.repeat(40))
    }
    
    // 使用正确的方式订阅
    const sub = relay.subscribe([
      {
        kinds: [1],
        "#t": ["ckb", "nervos"]
      }
    ], {
      id: 'ckb-monitor',
      onevent: handleEvent
    })
    
    // 如果命令行参数包含 --publish，则发布测试消息
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
        try {
          // 使用带回调的方式发布
          const publishResult = relay.publish(event, {
            onOk: () => console.log('发布成功!'),
            onSeen: () => console.log('消息已被 relay 接收'),
            onFailed: (reason) => console.error('发布失败:', reason)
          })
          
          console.log('事件已发送到 relay，等待结果...')
        } catch (error) {
          console.error('发布事件时出错:', error)
        }
      } else {
        console.error('事件签名验证失败，无法发布')
      }
    }
    
    console.log('按 Ctrl+C 退出')
    
    // 保持进程运行
    process.on('SIGINT', () => {
      console.log('正在关闭连接...')
      relay.close()
      process.exit(0)
    })
  } catch (error) {
    console.error('发生错误:', error)
  }
}

main() 