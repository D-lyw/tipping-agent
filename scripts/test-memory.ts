import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { openai } from '@ai-sdk/openai';

async function main() {
  try {
    console.log('初始化 Memory...');
    
    const memory = new Memory({
      storage: new PostgresStore({
        connectionString: process.env.AGENT_MEMORY_DATABASE_URL || "postgresql://localhost:5432/agent_memory",
      }),
      embedder: openai.embedding("text-embedding-3-small"),
      options: {
        lastMessages: 20,
        semanticRecall: {
          topK: 10,
          messageRange: {
            before: 10,
            after: 10,
          },
        },
        workingMemory: {
          enabled: true,
        },
      },
    }) as any;

    // 创建测试线程
    console.log('创建测试线程...');
    const thread = await memory.createThread({
      resourceId: 'test_user',
      title: '测试对话',
      metadata: {
        test: true,
        createdAt: new Date(),
      },
    });
    
    console.log('线程创建成功:', thread);

    // 保存测试消息
    console.log('\n保存测试消息...');
    await memory.saveMessages({
      messages: [
        {
          id: 'msg_1',
          threadId: thread.id,
          role: 'user',
          content: '你好，这是一条测试消息',
          createdAt: new Date(),
          type: 'text',
        },
      ],
    });

    // 查询消息
    console.log('\n查询消息...');
    const messages = await memory.query({
      threadId: thread.id,
      selectBy: {
        last: 10,
      },
    });

    console.log('查询结果:', messages);

    // 清理测试数据
    console.log('\n清理测试数据...');
    await memory.deleteThread(thread.id);
    
    console.log('测试完成！');
    
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

main(); 