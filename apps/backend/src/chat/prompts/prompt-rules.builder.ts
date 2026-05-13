/**
 * @file prompt-rules.builder.ts
 * @description 构建用户级提示规则的系统消息
 */

import { SystemMessage } from '@langchain/core/messages';

/**
 * 构建用户提示规则的系统消息
 * @param promptRules - 用户自定义的提示规则文本
 * @returns 系统消息，规则为空时返回 null
 */
export function buildPromptRulesMessage(promptRules: string) {
  if (!promptRules) {
    return null;
  }

  return new SystemMessage(
    `Follow these user-specific rules for every response unless a higher-priority system instruction conflicts:\n${promptRules}`,
  );
}
