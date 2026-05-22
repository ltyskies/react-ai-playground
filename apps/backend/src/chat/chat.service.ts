/**
 * @file chat.service.ts
 * @description 聊天服务门面，组合子服务对外提供统一接口
 * @module 聊天模块
 */

import { Injectable } from '@nestjs/common';
import { Result } from 'src/common/Result';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { ConversationSummaryService } from './services/conversation-summary.service';
import { ProfileExtractionService } from './services/profile-extraction.service';
import { StreamGenerationService } from './services/stream-generation.service';
import type { ConversationWorkspace } from './types/conversation-workspace.type';

interface GenerateStreamOptions {
  signal?: AbortSignal;
}

@Injectable()
export class ChatService {
  constructor(
    private conversationService: ConversationService,
    private messageService: MessageService,
    private conversationSummaryService: ConversationSummaryService,
    private profileExtractionService: ProfileExtractionService,
    private streamGenerationService: StreamGenerationService,
  ) {}

  /** 创建新会话 */
  async createConversation(userId?: number) {
    const requiredUserId = this.conversationService.getRequiredUserId(userId);
    const savedConversation =
      await this.conversationService.createConversation(userId);

    this.profileExtractionService
      .extractProfilesForUser(requiredUserId)
      .catch((err) =>
        console.error('Failed to extract profiles for user:', err),
      );

    return Result.successWithData(savedConversation.id);
  }

  /** 获取会话列表 */
  async getConversationList(userId?: number) {
    const list = await this.conversationService.getConversationList(userId);
    return Result.successWithData(list);
  }

  /** 删除会话 */
  async deleteConversation(userId: number | undefined, conversationId: number) {
    const result = await this.conversationService.deleteConversation(
      userId,
      conversationId,
    );
    return Result.successWithData(result);
  }

  /** 获取会话详情 */
  async getConversationDetail(
    userId: number | undefined,
    conversationId: number,
  ) {
    const detail = await this.conversationService.getConversationDetail(
      userId,
      conversationId,
    );
    return Result.successWithData(detail);
  }

  /** 保存会话工作区 */
  async saveConversationWorkspace(
    userId: number | undefined,
    conversationId: number,
    workspace: ConversationWorkspace,
  ) {
    const workspaceSnapshot =
      await this.conversationService.saveConversationWorkspace(
        userId,
        conversationId,
        workspace,
      );
    return Result.successWithData(workspaceSnapshot);
  }

  /** 生成流式回复 */
  async generateStream(
    userId: number | undefined,
    conversationId: number,
    content: string,
    workspace: ConversationWorkspace,
    requestId: string,
    options: GenerateStreamOptions = {},
  ): Promise<AsyncGenerator<string>> {
    return this.streamGenerationService.generateStream(
      userId,
      conversationId,
      content,
      workspace,
      requestId,
      options,
    );
  }
}
