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
    `请在每一次回复中都遵守以下用户自定义规则，除非有更高优先级的系统指令与之冲突：\n${promptRules}`,
  );
}
