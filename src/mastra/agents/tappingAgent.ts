import { tappingAgent } from './index';

/**
 * 内容评估和打赏接口
 */
interface ContentEvaluation {
  content: string;         // 内容文本
  author: string;          // 作者 ID 或公钥
  ckbAddress: string;      // CKB 地址
  platform: 'twitter' | 'nostr' | 'other';  // 平台类型
  eventId?: string;        // 事件/推文 ID
  replyToId?: string;      // 回复的推文/事件 ID
}

/**
 * 打赏结果接口
 */
interface RewardResult {
  success: boolean;        // 是否成功
  amount?: number;         // 打赏金额
  txHash?: string;         // 交易哈希
  error?: string;          // 错误信息
}

/**
 * 增强 tappingAgent 的功能，添加评估和打赏方法
 */
export const evaluateAndReward = async (content: ContentEvaluation): Promise<RewardResult> => {
  try {
    console.log(`评估来自 ${content.platform} 平台的内容，ID: ${content.eventId || '未知'}`);
    
    // 检查是否已经打赏过这个内容/用户
    // 在实际实现中，应该查询数据库进行检查
    // 这里简化处理
    
    // 构建提示信息
    const promptMessages = [
      {
        role: 'system',
        content: `你需要评估一段来自 ${content.platform} 平台的内容，判断是否值得打赏，以及打赏的金额。
        内容由用户 ${content.author} 发布，其中包含 CKB 地址: ${content.ckbAddress}。
        
        请考虑以下因素：
        1. 内容是否与 CKB 生态相关
        2. 内容质量如何（创新性、深度、实用性等）
        3. 用户贡献度
        4. 是否是重复内容
        
        请给出以下判断：
        1. 是否值得打赏（true/false）
        2. 如果值得打赏，建议打赏金额（CKB，介于 10-100 之间）
        3. 打赏理由
        
        请以 JSON 格式输出结果。`
      },
      {
        role: 'user',
        content: `平台: ${content.platform}
        ID: ${content.eventId || '未知'}
        ${content.replyToId ? `回复ID: ${content.replyToId}` : ''}
        作者: ${content.author}
        内容: ${content.content}
        CKB 地址: ${content.ckbAddress}`
      }
    ];
    // 调用 tappingAgent 进行评估
    const response = await tappingAgent.generate(JSON.stringify(promptMessages));
    console.log(`tappingAgent 评估响应: ${response.text}`);
    
    let evaluationResult;
    try {
      // 尝试解析 JSON 响应
      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.text.match(/{[\s\S]*?}/);
                       
      const jsonStr = jsonMatch ? jsonMatch[0].replace(/```json|```/g, '') : response.text;
      evaluationResult = JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析 tappingAgent 响应失败:', e);
      
      // 如果无法解析 JSON，尝试直接判断是否包含打赏意向
      const worthRewarding = response.text.toLowerCase().includes('值得打赏') || 
                            response.text.toLowerCase().includes('打赏') || 
                            response.text.toLowerCase().includes('reward');
      
      evaluationResult = {
        worthRewarding,
        amount: 10, // 默认最小金额
        reason: '内容与 CKB 生态相关',
      };
    }
    
    // 如果不值得打赏，直接返回
    if (!evaluationResult.worthRewarding) {
      console.log(`内容不值得打赏，原因: ${evaluationResult.reason || '未指定'}`);
      return {
        success: false,
        error: '内容评估结果不值得打赏'
      };
    }
    
    // 确定打赏金额
    const amount = evaluationResult.amount || 10;
    
    // 执行打赏交易
    console.log(`准备打赏 ${amount} CKB 到地址 ${content.ckbAddress}`);
    
    // 这里应该调用实际的打赏交易函数
    // 在示例中，我们模拟成功交易
    const txHash = `sim_tx_${Date.now().toString(16)}`;
    
    console.log(`打赏交易已提交，哈希: ${txHash}`);
    
    // 在实际实现中，应该将打赏记录保存到数据库
    
    // 返回打赏结果
    return {
      success: true,
      amount,
      txHash,
    };
  } catch (error) {
    console.error('评估和打赏过程出错:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// 扩展 tappingAgent
tappingAgent.evaluateAndReward = evaluateAndReward;

// 导出 tappingAgent
export { tappingAgent }; 