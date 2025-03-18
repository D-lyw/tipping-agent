import { nostrMonitor } from '../lib/nostrMonitor';
import { NostrContent } from '../lib/nostrContentFetcher';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 内容评估结果接口
export interface ContentEvaluationResult {
  contentId: string;
  pubkey: string;
  quality: number;
  isHighQuality: boolean;
  recommendation: 'reward' | 'ignore' | 'monitor';
  suggestedAmount?: number;
  metadata: {
    platform: 'nostr';
    tags: string[];
  };
}

export class NostrRewardTool {
  private minQualityThreshold: number;
  private tappingAgentInstance: any;
  
  constructor(tappingAgent?: any) {
    // 从环境变量获取质量阈值，默认为 0.6
    this.minQualityThreshold = parseFloat(process.env.NOSTR_MIN_QUALITY_THRESHOLD || '0.6');
    
    // 保存 tappingAgent 实例
    this.tappingAgentInstance = tappingAgent;
    
    console.log(`NostrRewardTool 初始化完成，质量阈值: ${this.minQualityThreshold}`);
  }
  
  /**
   * 设置 tapping agent 实例
   * @param agent tapping agent 实例
   */
  public setTappingAgent(agent: any): void {
    this.tappingAgentInstance = agent;
    console.log('已设置 tappingAgent 实例');
  }
  
  /**
   * 获取内容中的标签
   * @param content Nostr 内容
   * @returns 标签数组
   */
  private extractTags(content: NostrContent): string[] {
    // 从标签列表中提取标签
    const tagEntries = content.tags.filter(tag => tag[0] === 't');
    const tags = tagEntries.map(tag => tag[1]);
    
    // 如果没有找到标签，尝试从内容中提取关键词
    if (tags.length === 0) {
      const keywords = ['ckb', 'nervos', 'cryptocurrency', 'blockchain'];
      const foundKeywords = keywords.filter(keyword => 
        content.content.toLowerCase().includes(keyword.toLowerCase())
      );
      return foundKeywords;
    }
    
    return tags;
  }
  
  /**
   * 评估 Nostr 内容质量
   * @param content Nostr 内容
   * @returns 评估结果 Promise
   */
  public async evaluateContent(content: NostrContent): Promise<ContentEvaluationResult> {
    try {
      console.log(`评估 Nostr 内容 [${content.id.substring(0, 8)}...] 质量...`);
      
      let quality = 0;
      let recommendation: 'reward' | 'ignore' | 'monitor' = 'ignore';
      
      // 如果设置了 tappingAgent，使用它评估内容
      if (this.tappingAgentInstance) {
        try {
          // 这里应该是调用 tappingAgent 的方法
          // 简化实现，只是调用一个模拟的评估方法
          const evaluation = await this.evaluateWithTappingAgent(content);
          quality = evaluation.quality;
          
          // 根据质量确定推荐操作
          if (quality >= this.minQualityThreshold) {
            recommendation = 'reward';
          } else if (quality >= this.minQualityThreshold * 0.8) {
            recommendation = 'monitor';
          } else {
            recommendation = 'ignore';
          }
        } catch (error) {
          console.error('使用 tappingAgent 评估内容失败:', error);
          // 失败时使用备用评估方法
          quality = this.evaluateContentQuality(content);
          recommendation = quality >= this.minQualityThreshold ? 'reward' : 'ignore';
        }
      } else {
        // 没有 tappingAgent 时使用备用评估方法
        quality = this.evaluateContentQuality(content);
        recommendation = quality >= this.minQualityThreshold ? 'reward' : 'ignore';
      }
      
      // 提取内容标签
      const contentTags = this.extractTags(content);
      
      // 计算建议的打赏金额
      const suggestedAmount = this.calculateRewardAmount(quality);
      
      // 构建评估结果
      const result: ContentEvaluationResult = {
        contentId: content.id,
        pubkey: content.pubkey,
        quality,
        isHighQuality: quality >= this.minQualityThreshold,
        recommendation,
        suggestedAmount,
        metadata: {
          platform: 'nostr',
          tags: contentTags,
        }
      };
      
      console.log(`内容 [${content.id.substring(0, 8)}...] 评估结果: 质量 ${quality.toFixed(2)}, 推荐 ${recommendation}`);
      return result;
    } catch (error) {
      console.error('评估 Nostr 内容时出错:', error);
      // 出错时返回默认的低质量结果
      return {
        contentId: content.id,
        pubkey: content.pubkey,
        quality: 0,
        isHighQuality: false,
        recommendation: 'ignore',
        metadata: {
          platform: 'nostr',
          tags: [],
        }
      };
    }
  }
  
  /**
   * 使用 tappingAgent 评估内容
   * @param content Nostr 内容
   * @returns 评估结果
   */
  private async evaluateWithTappingAgent(content: NostrContent): Promise<{ quality: number }> {
    // 这里应该连接到实际的 tappingAgent 实现
    // 简化实现，返回一个随机数
    return {
      quality: Math.min(0.3 + Math.random() * 0.7, 1),
    };
  }
  
  /**
   * 备用的内容质量评估方法
   * @param content Nostr 内容
   * @returns 质量分数 (0-1)
   */
  private evaluateContentQuality(content: NostrContent): number {
    // 简单的评估逻辑，基于内容长度、关键词等
    const text = content.content.toLowerCase();
    
    // 基础分数
    let score = 0.3;
    
    // 长度加分（最多0.2分）
    const lengthScore = Math.min(text.length / 1000, 1) * 0.2;
    score += lengthScore;
    
    // 关键词加分（最多0.3分）
    const keywords = ['ckb', 'nervos', 'blockchain', 'crypto', 'defi', 'development', 'research'];
    let keywordCount = 0;
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        keywordCount++;
      }
    }
    
    const keywordScore = Math.min(keywordCount / keywords.length, 1) * 0.3;
    score += keywordScore;
    
    // 标签加分（最多0.2分）
    const tagScore = Math.min(content.tags.length / 5, 1) * 0.2;
    score += tagScore;
    
    // 确保分数在0-1之间
    return Math.min(Math.max(score, 0), 1);
  }
  
  /**
   * 计算打赏金额
   * @param quality 内容质量 (0-1)
   * @returns 打赏金额 (CKB)
   */
  private calculateRewardAmount(quality: number): number {
    // 从环境变量获取打赏金额范围
    const minAmount = parseInt(process.env.MIN_TIPPING_AMOUNT || '10', 10);
    const maxAmount = parseInt(process.env.MAX_TIPPING_AMOUNT || '1000', 10);
    
    // 基于质量计算金额
    if (quality < this.minQualityThreshold) {
      return 0; // 低于阈值不打赏
    }
    
    // 将质量映射到金额范围
    const normalizedQuality = (quality - this.minQualityThreshold) / (1 - this.minQualityThreshold);
    const amount = Math.floor(minAmount + normalizedQuality * (maxAmount - minAmount));
    
    return Math.min(amount, maxAmount);
  }
  
  /**
   * 对高质量内容执行打赏
   * @param evaluationResult 内容评估结果
   * @returns 是否成功打赏
   */
  public async rewardContent(evaluationResult: ContentEvaluationResult): Promise<boolean> {
    try {
      // 如果不建议打赏，直接返回
      if (evaluationResult.recommendation !== 'reward' || !evaluationResult.isHighQuality) {
        console.log(`跳过打赏内容 [${evaluationResult.contentId.substring(0, 8)}...]，质量不足或不推荐打赏`);
        return false;
      }
      
      // 获取打赏金额
      const amount = evaluationResult.suggestedAmount || this.calculateRewardAmount(evaluationResult.quality);
      
      if (amount <= 0) {
        console.log(`跳过打赏内容 [${evaluationResult.contentId.substring(0, 8)}...]，计算的打赏金额为 0`);
        return false;
      }
      
      console.log(`准备打赏内容 [${evaluationResult.contentId.substring(0, 8)}...]，金额: ${amount} CKB`);
      
      // 创建一个模拟的 Nostr 事件对象
      const nostrEvent = {
        id: evaluationResult.contentId,
        pubkey: evaluationResult.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [['t', 'ckb']],
        content: '这是一个测试内容', // 这里应该是实际内容，但因为我们只需要 ID 和 pubkey，所以可以简化
        sig: '',
      };
      
      // 调用 NostrMonitor 执行打赏
      await nostrMonitor.evaluateAndReward(nostrEvent);
      
      console.log(`成功打赏内容 [${evaluationResult.contentId.substring(0, 8)}...]`);
      return true;
    } catch (error) {
      console.error('打赏内容时出错:', error);
      return false;
    }
  }
}

// 导出单例
export const nostrRewardTool = new NostrRewardTool(); 