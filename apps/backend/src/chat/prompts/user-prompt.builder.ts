/**
 * @file user-prompt.builder.ts
 * @description 构建用户提示词，拼接上下文文件与用户输入
 */

import type { ConversationWorkspace } from '../types/conversation-workspace.type';

/**
 * 构建用户提示词
 * @description 把用户当前问题与选中的上下文文件拼接成发给模型的最终输入
 * @param content - 用户输入内容
 * @param workspace - 当前工作区快照
 * @returns 最终用户提示词
 */
export function buildUserPrompt(
  content: string,
  workspace: ConversationWorkspace,
) {
  const uniqueContextFiles = Array.from(
    new Set(workspace.contextFiles || []),
  ).filter((fileName) => workspace.files?.[fileName]);

  if (uniqueContextFiles.length === 0) {
    return content;
  }

  const contextContent = uniqueContextFiles
    .map((fileName) => {
      const file = workspace.files[fileName];
      return `File: ${fileName}\n\`\`\`${file.language}\n${file.value}\n\`\`\``;
    })
    .join('\n\n');

  return `Context Files:\n${contextContent}\n\nUser Question: ${content}`;
}
