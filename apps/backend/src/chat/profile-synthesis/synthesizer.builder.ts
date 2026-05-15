/**
 * @file synthesizer.builder.ts
 * @description Synthesizer Agent 用户提示词构建器
 */

import type { ProfileObservation } from '../types/profile-observation.type';

/** 单次合并最多展示的 observation 数，超出部分按置信度截断 */
const MAX_OBSERVATIONS_IN_PROMPT = 50;

/**
 * 构建 Synthesizer 的用户提示词
 * @param currentProfile - 当前用户画像内容（首次合成时为空字符串）
 * @param observations - Phase 1 提取的所有事实观察
 * @param reviewerFeedback - 上一轮 Reviewer 的反馈（迭代 > 1 时传入）
 * @returns 发给 Synthesizer Agent 的完整用户提示词
 */
export function buildSynthesizerPrompt(
  currentProfile: string,
  observations: ProfileObservation[],
  reviewerFeedback?: string | null,
): string {
  const observationsToShow = prioritizeObservations(observations);

  const observationsText = observationsToShow
    .map(
      (obs, index) =>
        `${index + 1}. [${obs.category}] [置信度: ${obs.confidence}] ${obs.fact}\n   证据: ${obs.evidence}`,
    )
    .join('\n\n');

  const feedbackBlock = reviewerFeedback
    ? `## 上一轮需要修复的问题\n${reviewerFeedback}\n\n`
    : '';

  return `${feedbackBlock}请根据以下验证过的用户偏好事实，输出一份完整的更新后用户画像。

## 当前用户画像
${currentProfile || '暂无画像，这是首次合成。'}

## 新提取的偏好事实
${observationsText}

请输出包含 profile 和 operations 的完整 JSON 对象，不要输出其他内容。`;
}

/**
 * 按置信度优先排列 observations，截断低置信度条目
 */
function prioritizeObservations(
  observations: ProfileObservation[],
): ProfileObservation[] {
  if (observations.length <= MAX_OBSERVATIONS_IN_PROMPT) return observations;

  const priority: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = [...observations].sort(
    (a, b) => (priority[a.confidence] ?? 2) - (priority[b.confidence] ?? 2),
  );
  return sorted.slice(0, MAX_OBSERVATIONS_IN_PROMPT);
}
