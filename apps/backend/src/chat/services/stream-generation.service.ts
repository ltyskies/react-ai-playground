/**
 * @file stream-generation.service.ts
 * @description 流式回复生成管道：组装 prompt、驱动代码生成编排器、产出结构化事件、持久化结果
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
import { buildPromptRulesMessage, buildUserPrompt } from '../prompts';
import { CODE_GENERATION_SYSTEM_PROMPT } from '../prompts/code-generation.prompt';
import type { ConversationWorkspace } from '../types/conversation-workspace.type';
import type { GenerationEvent } from '../types/generation-event.type';
import { REPLAY_CHUNK_SIZE } from '../config';
import { ConversationService } from './conversation.service';
import { MessageService } from './message.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { CodeGenerationOrchestratorService } from './code-generation-orchestrator.service';

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
    private codeGenerationOrchestrator: CodeGenerationOrchestratorService,
  ) {
    this.chatModel = createChatModel(this.configService);
  }

  /** 生成流式回复（产出结构化事件） */
  async generateStream(
    userId: number | undefined,
    conversationId: number,
    content: string,
    workspace: ConversationWorkspace,
    requestId: string,
    options: GenerateStreamOptions = {},
  ): Promise<AsyncGenerator<GenerationEvent>> {
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
      return this.createReplayGenerator(
        conversationId,
        normalizedRequestId,
        completedAssistantMessage.content,
      );
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
    // 暂时关闭将用户画像随对话一起传给大模型，恢复时改回 getUserPersonalProfile(userId)
    const personalProfile = '';
    const promptHistoryContext =
      await this.conversationSummaryService.buildPromptHistoryContext(
        conversation,
        promptHistory,
        savedUserMessage.id,
        (msg, currentId) =>
          this.messageService.shouldIncludeInPromptHistory(msg, currentId),
      );

    // 每轮都携带代码区全部文件（在 buildUserPrompt 中拼接，勾选文件打重点标记）。
    const userPrompt = buildUserPrompt(savedUserMessage.content, workspace);

    const messages: BaseMessage[] = [
      new SystemMessage(CODE_GENERATION_SYSTEM_PROMPT),
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
      new HumanMessage(userPrompt),
    ];

    return this.createModelStreamGenerator({
      conversation,
      conversationId,
      requestId: normalizedRequestId,
      messages,
      workspace,
      signal: options.signal,
    });
  }

  /** 创建模型流式生成器（驱动编排器、产出事件、持久化结果） */
  private createModelStreamGenerator(params: {
    conversation: Conversation;
    conversationId: number;
    requestId: string;
    messages: BaseMessage[];
    workspace: ConversationWorkspace;
    signal?: AbortSignal;
  }): AsyncGenerator<GenerationEvent> {
    const {
      conversation,
      conversationId,
      requestId,
      messages,
      workspace,
      signal,
    } = params;
    const conversationService = this.conversationService;
    const messageService = this.messageService;
    const orchestrator = this.codeGenerationOrchestrator;
    const model = this.chatModel;

    return (async function* generator() {
      try {
        const runner = orchestrator.run({ model, messages, workspace, signal });
        let next = await runner.next();
        while (!next.done) {
          if (signal?.aborted) {
            await messageService.updateRequestStatus(
              conversationId,
              requestId,
              StreamStatus.INTERRUPTED,
            );
            await conversationService.touchConversation(conversation);
            return;
          }
          yield next.value;
          next = await runner.next();
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

        const result = next.value;
        await messageService.saveCompletedAssistantMessage(
          conversationId,
          requestId,
          result.thinking,
          result.codeChanges,
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

  /** 创建回放生成器：重建思考文本与代码 file 事件 */
  private createReplayGenerator(
    conversationId: number,
    requestId: string,
    content: string,
  ): AsyncGenerator<GenerationEvent> {
    const messageService = this.messageService;

    return (async function* replay() {
      if (content) {
        for (let i = 0; i < content.length; i += REPLAY_CHUNK_SIZE) {
          yield {
            type: 'thinking',
            content: content.slice(i, i + REPLAY_CHUNK_SIZE),
          };
        }
      }

      const entity = await messageService.getAssistantMessageEntity(
        conversationId,
        requestId,
      );
      const codeChanges = entity?.codeChanges ?? [];

      for (const change of codeChanges) {
        yield {
          type: 'file_start',
          fileName: change.fileName,
          language: change.language,
          isNewFile: change.isNewFile,
          oldValue: change.oldValue,
        };

        const lines = change.newValue.split('\n');
        for (let index = 0; index < lines.length; index++) {
          yield {
            type: 'code',
            fileName: change.fileName,
            index,
            line: lines[index],
          };
        }

        yield {
          type: 'file_end',
          fileName: change.fileName,
          status: change.status,
          content: change.newValue,
        };
      }
    })();
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
