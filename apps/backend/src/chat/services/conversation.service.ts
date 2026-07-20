/**
 * @file conversation.service.ts
 * @description 会话 CRUD、工作区保存与权限校验
 */

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationRuntimeCacheService } from '../conversation-runtime-cache.service';
import { StreamStatus } from '../entities/message.entity';
import { getDisplayContent } from '../prompts';
import type { ConversationWorkspace } from '../types/conversation-workspace.type';

const DEFAULT_CONVERSATION_TITLES = ['New Chat'];

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private conversationRuntimeCacheService: ConversationRuntimeCacheService,
  ) {}

  /** 校验用户 ID，未登录时抛出异常 */
  getRequiredUserId(userId?: number) {
    if (!userId) {
      throw new ForbiddenException('Forbidden');
    }
    return userId;
  }

  /** 创建新会话 */
  async createConversation(userId?: number) {
    const requiredUserId = this.getRequiredUserId(userId);
    const conversation = this.conversationRepo.create({
      userId: requiredUserId,
      title: 'New Chat',
      workspaceSnapshot: null,
      memorySummary: null,
      summarizedUntilMessageId: null,
      memoryUpdatedAt: null,
      profileExtractedUntilMessageId: null,
      profileExtractedAt: null,
    });
    const savedConversation = await this.conversationRepo.save(conversation);
    return savedConversation;
  }

  /** 获取会话列表 */
  async getConversationList(userId?: number) {
    const requiredUserId = this.getRequiredUserId(userId);
    const conversations = await this.conversationRepo.find({
      where: { userId: requiredUserId },
      order: { updatedAt: 'DESC' },
    });
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }));
  }

  /** 删除会话 */
  async deleteConversation(userId: number | undefined, conversationId: number) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
    );
    await this.conversationRepo.remove(conversation);
    await this.conversationRuntimeCacheService.invalidate(conversationId);
    return { deleted: true };
  }

  /** 获取会话详情（含消息列表） */
  async getConversationDetail(
    userId: number | undefined,
    conversationId: number,
  ) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
      ['messages'],
    );
    const runtimeMessages = [...(conversation.messages || [])]
      .sort((a, b) => this.compareMessages(a, b))
      .map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        requestId: message.requestId ?? null,
        streamStatus: message.streamStatus ?? StreamStatus.COMPLETED,
        content: message.content,
        createdAt: new Date(message.createdAt),
      }));

    await this.conversationRuntimeCacheService.hydrate(
      conversation.id,
      runtimeMessages,
    );

    const messages = runtimeMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: getDisplayContent(message),
      requestId: message.requestId || null,
      status: message.streamStatus || StreamStatus.COMPLETED,
      createdAt: message.createdAt,
    }));

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages,
      workspaceSnapshot: conversation.workspaceSnapshot || null,
    };
  }

  /** 保存会话工作区 */
  async saveConversationWorkspace(
    userId: number | undefined,
    conversationId: number,
    workspace: ConversationWorkspace,
  ) {
    const conversation = await this.getAuthorizedConversation(
      userId,
      conversationId,
    );
    conversation.workspaceSnapshot = workspace;
    await this.touchConversation(conversation);
    return conversation.workspaceSnapshot;
  }

  /** 刷新会话更新时间 */
  async touchConversation(conversation: Conversation) {
    conversation.updatedAt = new Date();
    await this.conversationRepo.save(conversation);
  }

  /** 获取用户有权限访问的会话 */
  async getAuthorizedConversation(
    userId: number | undefined,
    conversationId: number,
    relations: string[] = [],
  ) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
      relations,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== this.getRequiredUserId(userId)) {
      throw new ForbiddenException('Forbidden');
    }

    return conversation;
  }

  /** 根据用户输入生成会话标题 */
  buildConversationTitle(content: string) {
    const normalizedContent = content.replace(/\s+/g, ' ').trim();
    if (!normalizedContent) return '';
    if (normalizedContent.length <= 30) return normalizedContent;
    return `${normalizedContent.slice(0, 30)}...`;
  }

  /** 用户发言后更新会话元信息 */
  async updateConversationAfterUserMessage(
    conversation: Conversation,
    content: string,
  ) {
    const nextTitle = this.buildConversationTitle(content);
    if (
      nextTitle &&
      (!conversation.title ||
        DEFAULT_CONVERSATION_TITLES.includes(conversation.title))
    ) {
      conversation.title = nextTitle;
    }
    await this.touchConversation(conversation);
  }

  private compareMessages(
    a: { createdAt: Date; id: number },
    b: { createdAt: Date; id: number },
  ) {
    const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id - b.id;
  }
}
