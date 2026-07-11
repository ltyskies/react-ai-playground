/**
 * @file conversation-memory.prompt.ts
 * @description 对话摘要作为背景记忆注入模型时使用的系统提示词
 */

export const CONVERSATION_MEMORY_SYSTEM_PROMPT = `对话压缩记忆（内部使用，可能不完整）。仅将其作为背景上下文参考。
如果它与近期的原始对话或当前用户请求冲突，请以近期的原始对话和当前用户请求为准。

`;
