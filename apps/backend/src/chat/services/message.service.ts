/**
 * @file message.service.ts
 * @description 消息持久化、运行时缓存管理与查询
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { Message, MessageRole, StreamStatus } from '../entities/message.entity';
import { ConversationRuntimeMemoryService } from '../conversation-runtime-memory.service';
import { Conversation } from '../entities/conversation.entity';
import { getDisplayContent } from '../prompts';
import type { ConversationRuntimeMessage } from '../types/conversation-runtime-memory.type';

export interface SaveMessageOptions {
  requestId?: string | null;
  streamStatus?: StreamStatus;
}

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    private conversationRuntimeMemoryService: ConversationRuntimeMemoryService,
  ) {}

  /** 从数据库加载会话完整历史 */
  async loadConversationHistoryFromDatabase(conversationId: number) {
    return this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /** 获取运行时消息历史（优先缓存） */
  async getConversationRuntimeMessages(conversationId: number) {
    const state = await this.conversationRuntimeMemoryService.getOrHydrate(
      conversationId,
      async () => {
        const history =
          await this.loadConversationHistoryFromDatabase(conversationId);
        return history.map((message) => this.toRuntimeMessage(message));
      },
    );
    return state.messages;
  }

  /** 保存消息 */
  async saveMessage(
    conversationId: number,
    content: string,
    role: MessageRole,
    options: SaveMessageOptions = {},
  ) {
    const message = this.messageRepo.create({
      conversationId,
      content,
      role,
      requestId: options.requestId ?? null,
      streamStatus: options.streamStatus ?? StreamStatus.COMPLETED,
    });
    return this.messageRepo.save(message);
  }

  /** 创建或复用用户消息（幂等） */
  async createOrReuseUserMessage(
    conversation: Conversation,
    history: ConversationRuntimeMessage[],
    conversationId: number,
    requestId: string,
    content: string,
    updateConversationCallback: (
      conversation: Conversation,
      content: string,
    ) => Promise<void>,
  ): Promise<ConversationRuntimeMessage> {
    const existingUserMessage = this.findMessageByRequestId(
      history,
      requestId,
      MessageRole.USER,
    );

    if (existingUserMessage) {
      if (getDisplayContent(existingUserMessage) !== content) {
        throw new Error(
          'Request content does not match the existing requestId',
        );
      }
      if (existingUserMessage.streamStatus !== StreamStatus.PENDING) {
        const updatedUserMessage = await this.messageRepo.save({
          ...existingUserMessage,
          streamStatus: StreamStatus.PENDING,
        });
        const runtimeMessage = this.toRuntimeMessage(updatedUserMessage);
        this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
        return runtimeMessage;
      }
      return existingUserMessage;
    }

    const savedUserMessage = await this.saveMessage(
      conversationId,
      content,
      MessageRole.USER,
      { requestId, streamStatus: StreamStatus.PENDING },
    );
    const runtimeMessage = this.toRuntimeMessage(savedUserMessage);
    this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
    await updateConversationCallback(conversation, content);
    return runtimeMessage;
  }

  /** 保存已完成的助手消息 */
  async saveCompletedAssistantMessage(
    conversationId: number,
    requestId: string,
    content: string,
  ): Promise<ConversationRuntimeMessage> {
    const history = await this.getConversationRuntimeMessages(conversationId);
    const existingAssistantMessage = this.findMessageByRequestId(
      history,
      requestId,
      MessageRole.ASSISTANT,
    );

    if (existingAssistantMessage?.streamStatus === StreamStatus.COMPLETED) {
      return existingAssistantMessage;
    }

    if (existingAssistantMessage) {
      const updatedAssistantMessage = await this.messageRepo.save({
        ...existingAssistantMessage,
        content,
        streamStatus: StreamStatus.COMPLETED,
      });
      const runtimeMessage = this.toRuntimeMessage(updatedAssistantMessage);
      this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
      return runtimeMessage;
    }

    const savedAssistantMessage = await this.saveMessage(
      conversationId,
      content,
      MessageRole.ASSISTANT,
      { requestId, streamStatus: StreamStatus.COMPLETED },
    );
    const runtimeMessage = this.toRuntimeMessage(savedAssistantMessage);
    this.conversationRuntimeMemoryService.upsertMessage(runtimeMessage);
    return runtimeMessage;
  }

  /** 按 requestId 查找消息 */
  findMessageByRequestId(
    history: ConversationRuntimeMessage[],
    requestId: string,
    role: MessageRole,
  ) {
    return history.find(
      (message) => message.requestId === requestId && message.role === role,
    );
  }

  /** 更新请求状态（批量更新用户消息 + 助手消息） */
  async updateRequestStatus(
    conversationId: number,
    requestId: string,
    status: StreamStatus,
  ) {
    await Promise.all([
      this.messageRepo.update(
        { conversationId, requestId, role: MessageRole.USER },
        { streamStatus: status },
      ),
      this.messageRepo.update(
        { conversationId, requestId, role: MessageRole.ASSISTANT },
        { streamStatus: status },
      ),
    ]);
    this.conversationRuntimeMemoryService.updateRequestStatus(
      conversationId,
      requestId,
      status,
    );
  }

  /** 转换为运行时消息结构 */
  toRuntimeMessage(
    message: ConversationRuntimeMessage | Message,
  ): ConversationRuntimeMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      requestId: message.requestId ?? null,
      streamStatus: message.streamStatus ?? StreamStatus.COMPLETED,
      content: message.content,
      createdAt: new Date(message.createdAt),
    };
  }

  /** 转换为 LangChain 历史消息 */
  toModelHistoryMessage(message: ConversationRuntimeMessage) {
    if (message.role === MessageRole.USER) {
      return new HumanMessage(getDisplayContent(message));
    }
    if (message.role === MessageRole.SYSTEM) {
      return new SystemMessage(message.content);
    }
    return new AIMessage(message.content);
  }

  /** 判断消息是否应进入提示词历史 */
  shouldIncludeInPromptHistory(
    message: ConversationRuntimeMessage,
    currentUserMessageId: number,
  ) {
    if (message.role === MessageRole.ASSISTANT) {
      return message.streamStatus === StreamStatus.COMPLETED;
    }
    if (message.role === MessageRole.USER) {
      return (
        message.streamStatus === StreamStatus.COMPLETED ||
        message.id === currentUserMessageId
      );
    }
    return true;
  }
}
