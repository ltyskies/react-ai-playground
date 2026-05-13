/**
 * @file summary-prompt.builder.ts
 * @description 构建长对话摘要相关的提示词模板
 */

import type { ConversationRuntimeMessage } from '../types/conversation-runtime-memory.type';
import { getDisplayContent } from './message-display';

/**
 * 已完成的会话轮次
 * @description 由一条用户消息和一条助手消息组成，可用于摘要折叠
 */
export interface CompletedConversationRound {
  /** 轮次对应的请求 ID */
  requestId: string;
  /** 该轮次中的用户消息 */
  userMessage: ConversationRuntimeMessage;
  /** 该轮次中的助手消息 */
  assistantMessage: ConversationRuntimeMessage;
}

/**
 * 格式化轮次摘要输入
 * @description 将轮次列表转换为可读的文本块，便于摘要模型理解上下文
 * @param rounds - 已完成轮次列表
 * @returns 格式化后的轮次文本
 */
export function formatConversationRoundsForSummary(
  rounds: CompletedConversationRound[],
) {
  return rounds
    .map(
      (round, index) => `### 轮次 ${index + 1}
requestId: ${round.requestId}

用户：${getDisplayContent(round.userMessage)}

助手：${round.assistantMessage.content}`,
    )
    .join('\n\n');
}

/**
 * 构建摘要提示词
 * @description 组织旧摘要和新增轮次，供摘要模型生成新的完整文档
 * @param memorySummary - 当前摘要内容
 * @param rounds - 新增待折叠轮次
 * @returns 发给摘要模型的提示词
 */
export function buildConversationSummaryPrompt(
  memorySummary: string,
  rounds: CompletedConversationRound[],
) {
  return `请根据已有摘要与新增对话轮次，输出一份完整的更新后摘要文档。

## 旧摘要
${memorySummary || '- 无'}

## 新增对话轮次
${formatConversationRoundsForSummary(rounds)}`;
}
