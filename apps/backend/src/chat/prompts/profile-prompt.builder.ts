/**
 * @file profile-prompt.builder.ts
 * @description 构建用户画像提取/更新所需的提示词
 */

import type { CompletedConversationRound } from './summary-prompt.builder';
import { formatConversationRoundsForSummary } from './summary-prompt.builder';

/**
 * 构建画像提取的用户提示词
 * @description 组织当前画像与对话轮次，供画像模型生成新的完整画像
 * @param currentProfile - 当前用户画像内容
 * @param rounds - 本轮对话的已完成轮次
 * @returns 发给画像提取模型的提示词
 */
export function buildPersonalProfilePrompt(
  currentProfile: string,
  rounds: CompletedConversationRound[],
) {
  return `请根据当前用户画像与对话历史，输出一份完整的更新后用户画像。

## 当前用户画像
${currentProfile || '暂无画像，这是首次提取。'}

## 对话历史
${formatConversationRoundsForSummary(rounds)}`;
}
