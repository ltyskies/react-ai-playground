/**
 * @file conversation-runtime-memory.type.ts
 * @description 会话运行时内存类型定义，用于描述缓存中的消息和状态结构
 * @module 聊天模块 - 类型定义
 */

import { MessageRole, StreamStatus } from '../entities/message.entity';

/**
 * 运行时消息对象
 * @description 表示缓存中的聊天消息快照，字段与流式会话处理直接对应
 */
export interface ConversationRuntimeMessage {
  /** 消息主键 ID */
  id: number;
  /** 所属会话 ID */
  conversationId: number;
  /** 消息角色 */
  role: MessageRole;
  /** 流式响应所属的请求 ID，普通消息可为空 */
  requestId: string | null;
  /** 流式生成状态 */
  streamStatus: StreamStatus;
  /** 消息正文内容 */
  content: string;
  /** 消息创建时间 */
  createdAt: Date;
}

/**
 * 会话运行时状态
 * @description 表示单个会话在内存中的消息列表以及访问时间信息
 */
export interface ConversationRuntimeState {
  /** 已按时间顺序整理好的消息列表 */
  messages: ConversationRuntimeMessage[];
  /** 首次从数据库加载到内存的时间 */
  hydratedAt: Date;
  /** 最近一次读取或更新该状态的时间 */
  lastAccessedAt: Date;
}
