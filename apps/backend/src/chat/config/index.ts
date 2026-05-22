/**
 * @file index.ts
 * @description 配置模块统一导出
 */

export {
  DEFAULT_CONVERSATION_TITLES,
  REPLAY_CHUNK_SIZE,
  LEGACY_PROMPT_MESSAGE_LIMIT,
  SUMMARY_TRIGGER_ROUNDS,
  RAW_HISTORY_RETENTION_ROUNDS,
  SUMMARY_BATCH_ROUNDS,
} from './chat-constants';
export { createChatModel, createSummaryModel } from './model.config';
