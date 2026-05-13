/**
 * @file conversation-runtime-memory.service.ts
 * @description 会话运行时内存服务，负责缓存会话消息并维护访问状态
 * @module 聊天模块
 */

import { Injectable } from '@nestjs/common';
import { StreamStatus } from './entities/message.entity';
import type {
  ConversationRuntimeMessage,
  ConversationRuntimeState,
} from './types/conversation-runtime-memory.type';

/**
 * 会话运行时内存服务
 * @description 在应用进程内缓存会话消息，减少频繁回库读取并支持流式状态更新
 */
@Injectable()
export class ConversationRuntimeMemoryService {
  // 以会话 ID 为键缓存运行时状态，便于后续快速读写。
  private readonly conversationStates = new Map<
    number,
    ConversationRuntimeState
  >();

  /**
   * 写入会话缓存
   * @description 使用最新消息列表重建指定会话的内存状态，并返回深拷贝结果
   * @param conversationId - 会话 ID
   * @param messages - 需要写入缓存的消息列表
   * @returns 最新的会话运行时状态副本
   */
  hydrate(conversationId: number, messages: ConversationRuntimeMessage[]) {
    const now = new Date();
    const nextState: ConversationRuntimeState = {
      // 写入缓存前先克隆并排序，避免外部引用污染内部状态。
      messages: this.sortMessages(
        messages.map((message) => this.cloneMessage(message)),
      ),
      hydratedAt: now,
      lastAccessedAt: now,
    };

    this.conversationStates.set(conversationId, nextState);
    return this.cloneState(nextState);
  }

  /**
   * 读取会话缓存
   * @description 获取指定会话的运行时状态，并刷新最近访问时间
   * @param conversationId - 会话 ID
   * @returns 会话运行时状态副本；若不存在则返回 null
   */
  get(conversationId: number) {
    const state = this.conversationStates.get(conversationId);

    if (!state) {
      return null;
    }

    state.lastAccessedAt = new Date();
    return this.cloneState(state);
  }

  /**
   * 获取或加载会话缓存
   * @description 优先读取已有缓存，不存在时通过加载器获取消息后再写入缓存
   * @param conversationId - 会话 ID
   * @param loader - 缓存未命中时的消息加载函数
   * @returns 会话运行时状态副本
   */
  async getOrHydrate(
    conversationId: number,
    loader: () => Promise<ConversationRuntimeMessage[]>,
  ) {
    const existingState = this.get(conversationId);

    if (existingState) {
      return existingState;
    }

    const messages = await loader();
    return this.hydrate(conversationId, messages);
  }

  /**
   * 新增或更新单条消息
   * @description 将消息写入指定会话缓存，已存在则按消息 ID 覆盖更新
   * @param message - 需要写入的消息
   * @returns 更新后的会话运行时状态副本；若会话未缓存则返回 null
   */
  upsertMessage(message: ConversationRuntimeMessage) {
    const state = this.conversationStates.get(message.conversationId);

    if (!state) {
      return null;
    }

    const nextMessage = this.cloneMessage(message);
    const messageIndex = state.messages.findIndex(
      (item) => item.id === nextMessage.id,
    );

    // 同一条消息在流式生成期间可能被多次更新，因此这里要做覆盖写入。
    if (messageIndex >= 0) {
      state.messages[messageIndex] = nextMessage;
    } else {
      state.messages.push(nextMessage);
    }

    state.messages = this.sortMessages(state.messages);
    state.lastAccessedAt = new Date();

    return this.cloneState(state);
  }

  /**
   * 更新请求对应的流式状态
   * @description 按 requestId 批量更新同一请求相关消息的流式状态
   * @param conversationId - 会话 ID
   * @param requestId - 请求 ID
   * @param status - 最新流式状态
   * @returns 更新后的会话运行时状态副本；参数无效或会话不存在时返回 null
   */
  updateRequestStatus(
    conversationId: number,
    requestId: string,
    status: StreamStatus,
  ) {
    if (!requestId) {
      return null;
    }

    const state = this.conversationStates.get(conversationId);

    if (!state) {
      return null;
    }

    state.messages = state.messages.map((message) =>
      message.requestId === requestId
        ? {
            ...message,
            streamStatus: status,
          }
        : message,
    );
    state.lastAccessedAt = new Date();

    return this.cloneState(state);
  }

  /**
   * 深拷贝运行时状态
   * @description 返回与内部缓存隔离的状态副本，避免调用方直接修改缓存对象
   * @param state - 原始会话状态
   * @returns 深拷贝后的会话状态
   */
  private cloneState(
    state: ConversationRuntimeState,
  ): ConversationRuntimeState {
    return {
      messages: state.messages.map((message) => this.cloneMessage(message)),
      hydratedAt: new Date(state.hydratedAt),
      lastAccessedAt: new Date(state.lastAccessedAt),
    };
  }

  /**
   * 克隆消息对象
   * @description 复制消息并单独克隆日期字段，避免 Date 对象被共享引用
   * @param message - 原始消息对象
   * @returns 消息副本
   */
  private cloneMessage(
    message: ConversationRuntimeMessage,
  ): ConversationRuntimeMessage {
    return {
      ...message,
      createdAt: new Date(message.createdAt),
    };
  }

  /**
   * 排序消息列表
   * @description 返回按创建时间和消息 ID 排序后的新数组，不修改原数组
   * @param messages - 待排序消息列表
   * @returns 排序后的消息副本数组
   */
  private sortMessages(messages: ConversationRuntimeMessage[]) {
    return messages.slice().sort((a, b) => this.compareMessages(a, b));
  }

  /**
   * 比较两条消息顺序
   * @description 先按创建时间排序，时间相同时再按主键 ID 排序，保证顺序稳定
   * @param a - 左侧消息
   * @param b - 右侧消息
   * @returns 排序比较结果
   */
  private compareMessages(
    a: ConversationRuntimeMessage,
    b: ConversationRuntimeMessage,
  ) {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id - b.id;
  }
}
