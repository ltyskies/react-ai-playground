/**
 * @file user-prompt.builder.ts
 * @description 构建用户提示词，拼接上下文文件与用户输入
 */

import type { ConversationWorkspace } from '../types/conversation-workspace.type';

/** 每轮用户消息末尾追加的代码块格式提醒 */
const FORMAT_REMINDER =
  '提醒：请务必按照系统提示词中的哨兵格式输出代码文件，每个文件用 <<<FILE path="...">>> 开始、用 <<<END_FILE>>> 结束，代码之外的解释不要使用 Markdown 代码围栏。';

/**
 * 构建用户提示词
 * @description 把用户当前问题与代码区全部文件拼接成发给模型的最终输入；
 * 文件以对象 key 去重，用户在聊天区勾选的文件打【重点】标记并排在最前。
 * @param content - 用户输入内容
 * @param workspace - 当前工作区快照
 * @returns 最终用户提示词
 */
export function buildUserPrompt(
  content: string,
  workspace: ConversationWorkspace,
) {
  const files = workspace.files || {};
  const allFileNames = Object.keys(files);

  if (allFileNames.length === 0) {
    return `${content}\n\n${FORMAT_REMINDER}`;
  }

  const emphasized = new Set(
    Array.from(new Set(workspace.contextFiles || [])).filter(
      (fileName) => files[fileName],
    ),
  );

  const orderedNames = [
    ...allFileNames.filter((fileName) => emphasized.has(fileName)),
    ...allFileNames.filter((fileName) => !emphasized.has(fileName)),
  ];

  const codeContext = orderedNames
    .map((fileName) => {
      const file = files[fileName];
      const mark = emphasized.has(fileName) ? '【重点】' : '';
      return `文件：${mark}${fileName}\n\`\`\`${file.language}\n${file.value}\n\`\`\``;
    })
    .join('\n\n');

  return `当前代码区全部文件（标记【重点】的是用户在聊天区勾选、需要重点关注的文件，请优先处理）：\n${codeContext}\n\n用户问题：${content}\n\n${FORMAT_REMINDER}`;
}
