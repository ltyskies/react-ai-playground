/**
 * @file message-display.ts
 * @description 消息展示文本提取工具，供提示词构建与界面展示复用
 */

import { MessageRole } from '../entities/message.entity';
import type { ConversationRuntimeMessage } from '../types/conversation-runtime-memory.type';

/**
 * 获取消息展示文本
 * @description 对旧版带上下文封装的用户消息做兼容处理，只提取实际提问内容
 * @param message - 运行时消息
 * @returns 面向界面与摘要使用的消息正文
 */
export function getDisplayContent(message: ConversationRuntimeMessage) {
  if (message.role !== MessageRole.USER) {
    return message.content;
  }

  const legacyQuestionMatch = message.content.match(
    /User Question:\s*([\s\S]+)$/i,
  );

  if (legacyQuestionMatch?.[1]) {
    return legacyQuestionMatch[1].trim();
  }

  return message.content;
}
