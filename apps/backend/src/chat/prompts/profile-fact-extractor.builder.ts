/**
 * @file profile-fact-extractor.builder.ts
 * @description Phase 1 事实提取的用户提示词构建器
 */

import type { CompletedConversationRound } from './summary-prompt.builder';
import { formatConversationRoundsForSummary } from './summary-prompt.builder';

/**
 * 构建事实提取的用户提示词
 * @description 组织对话轮次与现有画像摘要，供事实提取模型从中找出新偏好信号
 * @param existingProfileSummary - 当前已有画像的简要摘要（用于避免重复提取）
 * @param rounds - 待分析的对话轮次
 * @returns 发给事实提取模型的提示词
 */
export function buildFactExtractorPrompt(
  existingProfileSummary: string,
  rounds: CompletedConversationRound[],
) {
  const profileContext = existingProfileSummary
    ? `## 已知用户画像摘要（避免重复提取）\n${existingProfileSummary}`
    : '## 已知用户画像摘要\n暂无，这是首次提取。';

  return `请从以下对话中提取用户偏好事实。

${profileContext}

## 对话轮次
${formatConversationRoundsForSummary(rounds)}

请输出 JSON，不要输出其他内容。`;
}
