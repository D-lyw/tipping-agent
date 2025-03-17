import { mastra } from '../mastra';
import { createXClient } from '../lib/x';
import { tappingAgent } from '../mastra/agents';
import { replyMonitor } from '../lib/replyMonitor';
import { scheduleJob } from 'node-schedule';

// CKB 生态相关关键词
const CKB_KEYWORDS = [
  'CKB',
  'Nervos Network',
  'Nervos CKB',
  'Godwoken',
  'Axon',
  'Nervos DAO',
  'CKByte',
  '#CKB',
  '#NervosNetwork',
  '#Godwoken',
  '#Axon'
];

// 创建 X 客户端实例
const xClient = createXClient(
  process.env.TWITTER_API_KEY || '',
  process.env.TWITTER_API_SECRET || '',
  process.env.TWITTER_ACCESS_TOKEN || '',
  process.env.TWITTER_ACCESS_SECRET || ''
);

/**
 * CKB 生态监控工作流
 */
export const ckbEcosystemMonitor = mastra.createWorkflow({
  name: 'ckbEcosystemMonitor',
  
  // 定义工作流步骤
  steps: {
    /**
     * 搜索 CKB 生态相关推文
     */
    searchCKBTweets: async () => {
      console.log('开始搜索 CKB 生态相关推文...');
      
      // 构建搜索查询
      const query = CKB_KEYWORDS.join(' OR ');
      
      try {
        // 搜索最近 24 小时内的相关推文
        const result = await xClient.searchRecentTweets(query, {
          max_results: 50,
          'tweet.fields': ['author_id', 'created_at', 'public_metrics', 'text'],
          'user.fields': ['username', 'name', 'profile_image_url']
        });
        
        if (!result.success || !result.data) {
          console.error('搜索推文失败:', result.error);
          return { success: false, error: result.error };
        }
        
        console.log(`找到 ${result.data.length} 条相关推文`);
        return { success: true, tweets: result.data, includes: result.includes };
      } catch (error) {
        console.error('搜索推文时出错:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    
    /**
     * 筛选高质量推文
     */
    filterQualityTweets: async (context) => {
      if (!context.searchCKBTweets?.success || !context.searchCKBTweets.tweets) {
        return { success: false, error: '没有找到推文或搜索失败' };
      }
      
      const tweets = context.searchCKBTweets.tweets;
      const includes = context.searchCKBTweets.includes || {};
      
      // 初步筛选：至少有 5 个赞或 2 次转发的推文
      const potentialQualityTweets = tweets.filter(tweet => {
        const metrics = tweet.public_metrics;
        return (metrics?.like_count >= 5 || metrics?.retweet_count >= 2);
      });
      
      console.log(`初步筛选出 ${potentialQualityTweets.length} 条潜在高质量推文`);
      
      // 为每条推文添加作者信息
      const tweetsWithAuthor = potentialQualityTweets.map(tweet => {
        const author = includes.users?.find(user => user.id === tweet.author_id);
        return {
          ...tweet,
          author_username: author?.username || 'unknown',
          author_name: author?.name || 'Unknown User'
        };
      });
      
      return { success: true, qualityTweets: tweetsWithAuthor };
    },
    
    /**
     * 使用 tapping Agent 评估推文质量
     */
    evaluateTweetsWithTappingAgent: async (context) => {
      if (!context.filterQualityTweets?.success || !context.filterQualityTweets.qualityTweets) {
        return { success: false, error: '没有找到高质量推文或筛选失败' };
      }
      
      const qualityTweets = context.filterQualityTweets.qualityTweets;
      const evaluationResults = [];
      
      console.log(`开始使用 tapping Agent 评估 ${qualityTweets.length} 条推文...`);
      
      for (const tweet of qualityTweets) {
        try {
          // 使用 tapping Agent 评估推文质量
          const response = await tappingAgent.generate([
            {
              role: 'system',
              content: `你是 CKB 生态的内容评估专家。你需要评估一条推文是否是高质量的 CKB 生态相关内容。
              高质量内容的标准：
              1. 与 CKB/Nervos 生态直接相关
              2. 包含有价值的信息、见解或讨论
              3. 不是简单的价格讨论或无意义的宣传
              4. 对社区有教育意义或促进讨论
              
              请以 JSON 格式返回评估结果，包含以下字段：
              - isQuality: 布尔值，表示是否是高质量内容
              - score: 1-10 的评分
              - reason: 评估理由
              - shouldMonitor: 布尔值，表示是否应该监控这条推文的回复`
            },
            {
              role: 'user',
              content: `推文 ID: ${tweet.id}
              作者: @${tweet.author_username} (${tweet.author_name})
              内容: ${tweet.text}
              赞: ${tweet.public_metrics?.like_count || 0}
              转发: ${tweet.public_metrics?.retweet_count || 0}
              回复: ${tweet.public_metrics?.reply_count || 0}
              发布时间: ${tweet.created_at}`
            }
          ]);
          
          // 解析 tapping Agent 的响应
          let evaluation;
          try {
            // 尝试从响应中提取 JSON
            const jsonMatch = response.text.match(/```json\n([\s\S]*?)\n```/) || 
                             response.text.match(/```([\s\S]*?)```/) ||
                             response.text.match(/({[\s\S]*?})/);
                             
            const jsonStr = jsonMatch ? jsonMatch[1] : response.text;
            evaluation = JSON.parse(jsonStr);
          } catch (parseError) {
            console.error('解析 tapping Agent 响应失败:', parseError);
            evaluation = {
              isQuality: false,
              score: 0,
              reason: '无法解析评估结果',
              shouldMonitor: false
            };
          }
          
          evaluationResults.push({
            tweet,
            evaluation
          });
          
          console.log(`评估推文 ${tweet.id}: 质量=${evaluation.isQuality}, 分数=${evaluation.score}`);
        } catch (error) {
          console.error(`评估推文 ${tweet.id} 时出错:`, error);
          evaluationResults.push({
            tweet,
            evaluation: {
              isQuality: false,
              score: 0,
              reason: `评估出错: ${error instanceof Error ? error.message : String(error)}`,
              shouldMonitor: false
            }
          });
        }
      }
      
      // 筛选出高质量推文
      const highQualityTweets = evaluationResults
        .filter(result => result.evaluation.isQuality)
        .sort((a, b) => b.evaluation.score - a.evaluation.score);
      
      console.log(`评估完成，找到 ${highQualityTweets.length} 条高质量推文`);
      
      return { 
        success: true, 
        highQualityTweets,
        allEvaluations: evaluationResults
      };
    },
    
    /**
     * 监控高质量推文的回复
     */
    monitorQualityTweets: async (context) => {
      if (!context.evaluateTweetsWithTappingAgent?.success || 
          !context.evaluateTweetsWithTappingAgent.highQualityTweets) {
        return { success: false, error: '没有找到高质量推文或评估失败' };
      }
      
      const highQualityTweets = context.evaluateTweetsWithTappingAgent.highQualityTweets;
      const tweetsToMonitor = highQualityTweets
        .filter(item => item.evaluation.shouldMonitor)
        .map(item => item.tweet);
      
      console.log(`开始监控 ${tweetsToMonitor.length} 条高质量推文的回复...`);
      
      // 确保回复监控服务已启动
      replyMonitor.start();
      
      // 添加推文到监控列表
      for (const tweet of tweetsToMonitor) {
        replyMonitor.addTweetToMonitor(tweet.id, tweet.author_id);
      }
      
      return { 
        success: true, 
        monitoredTweets: tweetsToMonitor 
      };
    },
    
    /**
     * 与高质量推文互动（点赞、转发、评论等）
     */
    interactWithQualityTweets: async (context) => {
      if (!context.evaluateTweetsWithTappingAgent?.success || 
          !context.evaluateTweetsWithTappingAgent.highQualityTweets) {
        return { success: false, error: '没有找到高质量推文或评估失败' };
      }
      
      const highQualityTweets = context.evaluateTweetsWithTappingAgent.highQualityTweets;
      const topTweets = highQualityTweets
        .filter(item => item.evaluation.score >= 8) // 只与评分 8 分以上的推文互动
        .map(item => item.tweet)
        .slice(0, 5); // 限制互动数量，避免过多操作
      
      console.log(`准备与 ${topTweets.length} 条顶级推文互动...`);
      
      const interactionResults = [];
      
      for (const tweet of topTweets) {
        try {
          // 点赞推文
          const likeResult = await xClient.likeTweet(tweet.id);
          
          // 如果是特别高质量的内容（9分以上），考虑转发
          let retweetResult = { success: false, message: '未执行转发' };
          if (highQualityTweets.find(t => t.tweet.id === tweet.id)?.evaluation.score >= 9) {
            retweetResult = await xClient.retweetTweet(tweet.id);
          }
          
          interactionResults.push({
            tweetId: tweet.id,
            authorUsername: tweet.author_username,
            likeResult,
            retweetResult
          });
          
          console.log(`与推文 ${tweet.id} 互动: 点赞=${likeResult.success}, 转发=${retweetResult.success}`);
        } catch (error) {
          console.error(`与推文 ${tweet.id} 互动时出错:`, error);
          interactionResults.push({
            tweetId: tweet.id,
            authorUsername: tweet.author_username,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      return { success: true, interactionResults };
    }
  },
  
  // 定义工作流触发器
  triggers: {
    // 手动触发
    manualTrigger: {
      handler: async () => {
        return await mastra.workflows.ckbEcosystemMonitor.execute({
          searchCKBTweets: {},
          filterQualityTweets: {},
          evaluateTweetsWithTappingAgent: {},
          monitorQualityTweets: {},
          interactWithQualityTweets: {}
        });
      }
    },
    
    // 定时触发（每天两次）
    scheduledTrigger: {
      handler: () => {
        // 每天上午 10 点和下午 6 点运行
        const morningJob = scheduleJob('0 10 * * *', async () => {
          console.log('执行定时 CKB 生态监控（上午）...');
          await mastra.workflows.ckbEcosystemMonitor.trigger('manualTrigger');
        });
        
        const eveningJob = scheduleJob('0 18 * * *', async () => {
          console.log('执行定时 CKB 生态监控（下午）...');
          await mastra.workflows.ckbEcosystemMonitor.trigger('manualTrigger');
        });
        
        return { success: true, message: '定时任务已设置' };
      }
    }
  }
});

// 导出工作流
export default ckbEcosystemMonitor; 