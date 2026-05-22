/**
 * @file stream-generation.service.ts
 * @description 流式回复生成管道：组装 prompt、调用模型、消费流、持久化结果
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { User } from '../../user/entities/user.entity';
import { Conversation } from '../entities/conversation.entity';
import { MessageRole, StreamStatus } from '../entities/message.entity';
import { createChatModel } from '../config';
import {
  CODING_ASSISTANT_SYSTEM_PROMPT,
  buildPromptRulesMessage,
  buildUserPrompt,
} from '../prompts';
import type { ConversationWorkspace } from '../types/conversation-workspace.type';
import { REPLAY_CHUNK_SIZE } from '../config';
import { ConversationService } from './conversation.service';
import { MessageService } from './message.service';
import { ConversationSummaryService } from './conversation-summary.service';

interface GenerateStreamOptions {
  signal?: AbortSignal;
}

@Injectable()
export class StreamGenerationService {
  private chatModel: ChatOpenAI;

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private conversationService: ConversationService,
    private messageService: MessageService,
    private conversationSummaryService: ConversationSummaryService,
  ) {
    this.chatModel = createChatModel(this.configService);
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
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('Missing requestId');
    }

    const conversation =
      await this.conversationService.getAuthorizedConversation(
        userId,
        conversationId,
      );

    conversation.workspaceSnapshot = workspace;
    await this.conversationService.touchConversation(conversation);

    const history =
      await this.messageService.getConversationRuntimeMessages(conversationId);
    const completedAssistantMessage =
      this.messageService.findMessageByRequestId(
        history,
        normalizedRequestId,
        MessageRole.ASSISTANT,
      );
    if (completedAssistantMessage?.streamStatus === StreamStatus.COMPLETED) {
      await this.messageService.updateRequestStatus(
        conversationId,
        normalizedRequestId,
        StreamStatus.COMPLETED,
      );
      return this.createReplayGenerator(completedAssistantMessage.content);
    }

    const savedUserMessage = await this.messageService.createOrReuseUserMessage(
      conversation,
      history,
      conversationId,
      normalizedRequestId,
      content,
      (conv, c) =>
        this.conversationService.updateConversationAfterUserMessage(conv, c),
    );

    const promptHistory =
      await this.messageService.getConversationRuntimeMessages(conversationId);
    const promptRules = await this.getUserPromptRules(userId);
    const personalProfile = await this.getUserPersonalProfile(userId);
    const promptHistoryContext =
      await this.conversationSummaryService.buildPromptHistoryContext(
        conversation,
        promptHistory,
        savedUserMessage.id,
        (msg, currentId) =>
          this.messageService.shouldIncludeInPromptHistory(msg, currentId),
      );

    const messages: BaseMessage[] = [
      new SystemMessage(CODING_ASSISTANT_SYSTEM_PROMPT),
      ...(promptRules ? [buildPromptRulesMessage(promptRules)!] : []),
      ...(personalProfile
        ? [
            new SystemMessage(
              `以下是当前已知的用户偏好画像，请在回复时参考这些偏好：\n${personalProfile}`,
            ),
          ]
        : []),
      ...(promptHistoryContext.memorySummary
        ? [
            this.conversationSummaryService.buildMemorySystemMessage(
              promptHistoryContext.memorySummary,
            )!,
          ]
        : []),
      ...promptHistoryContext.rawHistoryMessages.map((message) =>
        this.messageService.toModelHistoryMessage(message),
      ),
      new HumanMessage(buildUserPrompt(savedUserMessage.content, workspace)),
    ];

    const stream = await this.chatModel.stream(messages);
    return this.createModelStreamGenerator({
      conversation,
      conversationId,
      requestId: normalizedRequestId,
      stream,
      signal: options.signal,
    });
  }

  /** 创建模型流式生成器（消费流、写入助手消息、同步状态） */
  private createModelStreamGenerator(params: {
    conversation: Conversation;
    conversationId: number;
    requestId: string;
    stream: AsyncIterable<{ content: unknown }>;
    signal?: AbortSignal;
  }): AsyncGenerator<string> {
    const { conversation, conversationId, requestId, stream, signal } = params;
    const conversationService = this.conversationService;
    const messageService = this.messageService;

    return (async function* generator() {
      let fullResponse = '';

      try {
        for await (const chunk of stream) {
          if (signal?.aborted) {
            await messageService.updateRequestStatus(
              conversationId,
              requestId,
              StreamStatus.INTERRUPTED,
            );
            await conversationService.touchConversation(conversation);
            return;
          }

          const chunkContent = extractChunkContent(chunk.content);
          if (!chunkContent) continue;

          fullResponse += chunkContent;
          yield chunkContent;
        }

        if (signal?.aborted) {
          await messageService.updateRequestStatus(
            conversationId,
            requestId,
            StreamStatus.INTERRUPTED,
          );
          await conversationService.touchConversation(conversation);
          return;
        }

        await messageService.saveCompletedAssistantMessage(
          conversationId,
          requestId,
          fullResponse,
        );
        await messageService.updateRequestStatus(
          conversationId,
          requestId,
          StreamStatus.COMPLETED,
        );
        await conversationService.touchConversation(conversation);
      } catch (error) {
        if (signal?.aborted) {
          await messageService.updateRequestStatus(
            conversationId,
            requestId,
            StreamStatus.INTERRUPTED,
          );
          await conversationService.touchConversation(conversation);
          return;
        }

        await messageService.updateRequestStatus(
          conversationId,
          requestId,
          StreamStatus.FAILED,
        );
        await conversationService.touchConversation(conversation);
        throw error;
      }
    })();
  }

  /** 创建回放生成器 */
  private async *createReplayGenerator(content: string) {
    if (!content) return;
    for (let i = 0; i < content.length; i += REPLAY_CHUNK_SIZE) {
      yield content.slice(i, i + REPLAY_CHUNK_SIZE);
    }
  }

  /** 获取用户提示规则 */
  private async getUserPromptRules(userId?: number) {
    const requiredUserId = this.conversationService.getRequiredUserId(userId);
    const user = await this.userRepo.findOne({
      where: { id: requiredUserId },
    });
    if (!user?.promptRules) return '';
    return user.promptRules.trim();
  }

  /** 获取用户画像 */
  private async getUserPersonalProfile(userId: number | undefined) {
    const requiredUserId = this.conversationService.getRequiredUserId(userId);
    const user = await this.userRepo.findOne({
      where: { id: requiredUserId },
    });
    if (!user?.personalProfile || typeof user.personalProfile !== 'object') {
      return '';
    }
    const profile = user.personalProfile as { content?: string };
    return profile.content?.trim() || '';
  }
}

/** 提取模型分片文本（模块级工具函数，避免闭包内 this 引用） */
function extractChunkContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (
        part &&
        typeof part === 'object' &&
        'text' in part &&
        typeof part.text === 'string'
      )
        return part.text;
      return '';
    })
    .join('');
}
