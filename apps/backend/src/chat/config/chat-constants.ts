/**
 * @file chat-constants.ts
 * @description 聊天模块行为控制常量
 */

/** 默认会话标题候选列表，用于判断标题是否仍可被首轮消息自动覆盖。 */
export const DEFAULT_CONVERSATION_TITLES = ['New Chat', '新对话'];

/** 已完成消息回放时，每个分片返回的最大字符数。 */
export const REPLAY_CHUNK_SIZE = 120;

/** 未启用摘要时，旧版历史回放最多保留的消息条数。 */
export const LEGACY_PROMPT_MESSAGE_LIMIT = 20;

/** 达到该轮次后开始考虑把历史对话折叠为摘要。 */
export const SUMMARY_TRIGGER_ROUNDS = 20;

/** 无论摘要是否存在，都保留最近若干轮原始消息供模型直接参考。 */
export const RAW_HISTORY_RETENTION_ROUNDS = 8;

/** 单次摘要合并处理的轮次数，避免一次提交过长上下文。 */
export const SUMMARY_BATCH_ROUNDS = 10;

/** Phase 1 事实提取单批处理的轮次数。 */
export const PROFILE_FACT_EXTRACTION_BATCH_ROUNDS = 5;

/** 触发画像提取的最小新增轮次数。 */
export const PROFILE_EXTRACTION_MIN_ROUNDS = 3;
