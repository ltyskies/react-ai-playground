/**
 * @file conversation-memory.prompt.ts
 * @description 对话摘要作为背景记忆注入模型时使用的系统提示词
 */

export const CONVERSATION_MEMORY_SYSTEM_PROMPT = `Conversation compressed memory (internal, may be incomplete). Use this as background context only.
If it conflicts with the recent raw conversation or the current user request, follow the recent raw conversation and the current user request.

`;
