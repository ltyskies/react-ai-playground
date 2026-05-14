/**
 * @file profile-synthesizer.builder.ts
 * @description Phase 2 画像合成的用户提示词构建器
 */

import type { ProfileObservation } from '../types/profile-observation.type';

/**
 * 构建画像合成的用户提示词
 * @description 组织现有画像与新提取的事实观察，供合成模型生成最终画像
 * @param currentProfile - 当前用户画像内容
 * @param observations - Phase 1 提取的所有事实观察
 * @returns 发给画像合成模型的提示词
 */
export function buildProfileSynthesizerPrompt(
  currentProfile: string,
  observations: ProfileObservation[],
) {
  const observationsText = observations
    .map(
      (obs, index) =>
        `${index + 1}. [${obs.category}] [置信度: ${obs.confidence}] ${obs.fact}\n   证据: ${obs.evidence}`,
    )
    .join('\n\n');

  return `请根据以下验证过的用户偏好事实，输出一份完整的更新后用户画像。

## 当前用户画像
${currentProfile || '暂无画像，这是首次合成。'}

## 新提取的偏好事实
${observationsText}

请输出完整的 Markdown 画像文档，不要输出其他内容。`;
}
