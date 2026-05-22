/**
 * @file conversation-summary.service.ts
 * @description 对话摘要生成与历史上下文构建
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { Conversation } from '../entities/conversation.entity';
import { StreamStatus } from '../entities/message.entity';
import { MessageRole } from '../entities/message.entity';
import { createSummaryModel } from '../config';
import {
  CONVERSATION_SUMMARY_SYSTEM_PROMPT,
  CONVERSATION_MEMORY_SYSTEM_PROMPT,
  buildConversationSummaryPrompt,
} from '../prompts';
import type { CompletedConversationRound } from '../prompts';
import type { ConversationRuntimeMessage } from '../types/conversation-runtime-memory.type';
import {
  SUMMARY_TRIGGER_ROUNDS,
  RAW_HISTORY_RETENTION_ROUNDS,
  SUMMARY_BATCH_ROUNDS,
  LEGACY_PROMPT_MESSAGE_LIMIT,
} from '../config';

interface ConversationMemoryState {
  memorySummary: string;
  recentRounds: CompletedConversationRound[];
}

interface PromptHistoryContext {
  memorySummary: string;
  rawHistoryMessages: ConversationRuntimeMessage[];
}

@Injectable()
export class ConversationSummaryService {
  private summaryModel: ChatOpenAI;

  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    private configService: ConfigService,
  ) {
    this.summaryModel = createSummaryModel(this.configService);
  }

  /** 收集已完成轮次（用户消息 + 助手消息配对） */
  collectCompletedRounds(
    history: ConversationRuntimeMessage[],
  ): CompletedConversationRound[] {
    const roundsByRequestId = new Map<
      string,
      {
        requestId: string;
        userMessage?: ConversationRuntimeMessage;
        assistantMessage?: ConversationRuntimeMessage;
      }
    >();

    for (const message of history) {
      if (
        !message.requestId ||
        message.streamStatus !== StreamStatus.COMPLETED ||
        (message.role !== MessageRole.USER &&
          message.role !== MessageRole.ASSISTANT)
      ) {
        continue;
      }

      const round = roundsByRequestId.get(message.requestId) || {
        requestId: message.requestId,
      };

      if (message.role === MessageRole.USER && !round.userMessage) {
        round.userMessage = message;
      }
      if (message.role === MessageRole.ASSISTANT && !round.assistantMessage) {
        round.assistantMessage = message;
      }

      roundsByRequestId.set(message.requestId, round);
    }

    return Array.from(roundsByRequestId.values())
      .filter((round): round is CompletedConversationRound =>
        Boolean(round.userMessage && round.assistantMessage),
      )
      .sort((a, b) => {
        const timeDiff =
          a.userMessage.createdAt.getTime() - b.userMessage.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.userMessage.id - b.userMessage.id;
      });
  }

  /** 展开完整轮次为线性消息历史 */
  flattenCompletedRounds(rounds: CompletedConversationRound[]) {
    return rounds.flatMap((round) => [
      round.userMessage,
      round.assistantMessage,
    ]);
  }

  /** 获取轮次最大消息 ID */
  getRoundMaxMessageId(round: CompletedConversationRound) {
    return Math.max(round.userMessage.id, round.assistantMessage.id);
  }

  /** 构建旧版历史上下文（摘要不可用时的兜底） */
  buildLegacyPromptHistory(
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
    shouldInclude: (
      msg: ConversationRuntimeMessage,
      currentId: number,
    ) => boolean,
  ) {
    return history
      .slice(-LEGACY_PROMPT_MESSAGE_LIMIT)
      .filter(
        (message) =>
          message.id !== currentUserMessageId &&
          shouldInclude(message, currentUserMessageId),
      );
  }

  /** 构建短对话历史（无需摘要折叠时） */
  buildShortConversationHistory(
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
    shouldInclude: (
      msg: ConversationRuntimeMessage,
      currentId: number,
    ) => boolean,
  ) {
    return history.filter(
      (message) =>
        message.id !== currentUserMessageId &&
        shouldInclude(message, currentUserMessageId),
    );
  }

  /** 构建模型所需的历史上下文 */
  async buildPromptHistoryContext(
    conversation: Conversation,
    history: ConversationRuntimeMessage[],
    currentUserMessageId: number,
    shouldInclude: (
      msg: ConversationRuntimeMessage,
      currentId: number,
    ) => boolean,
  ): Promise<PromptHistoryContext> {
    const legacyHistory = this.buildLegacyPromptHistory(
      history,
      currentUserMessageId,
      shouldInclude,
    );

    try {
      const completedRounds = this.collectCompletedRounds(history);
      const hasConversationMemory = Boolean(conversation.memorySummary?.trim());

      if (
        !hasConversationMemory &&
        completedRounds.length <= SUMMARY_TRIGGER_ROUNDS
      ) {
        return {
          memorySummary: '',
          rawHistoryMessages: this.buildShortConversationHistory(
            history,
            currentUserMessageId,
            shouldInclude,
          ),
        };
      }

      const memoryState = await this.ensureConversationMemory(
        conversation,
        completedRounds,
      );

      return {
        memorySummary: memoryState.memorySummary,
        rawHistoryMessages: this.flattenCompletedRounds(
          memoryState.recentRounds,
        ),
      };
    } catch (error) {
      console.error(
        `Failed to refresh conversation memory for conversation ${conversation.id}:`,
        error,
      );
      return { memorySummary: '', rawHistoryMessages: legacyHistory };
    }
  }

  /** 确保会话摘要可用（增量合并） */
  async ensureConversationMemory(
    conversation: Conversation,
    completedRounds: CompletedConversationRound[],
  ): Promise<ConversationMemoryState> {
    const hasStoredMemory = Boolean(conversation.memorySummary?.trim());
    let memorySummary = hasStoredMemory
      ? conversation.memorySummary!.trim()
      : '';
    let summarizedUntilMessageId = hasStoredMemory
      ? conversation.summarizedUntilMessageId || 0
      : 0;
    let unsummarizedRounds = completedRounds.filter(
      (round) => this.getRoundMaxMessageId(round) > summarizedUntilMessageId,
    );

    if (unsummarizedRounds.length > RAW_HISTORY_RETENTION_ROUNDS) {
      const roundsToSummarize = unsummarizedRounds.slice(
        0,
        unsummarizedRounds.length - RAW_HISTORY_RETENTION_ROUNDS,
      );

      for (
        let startIndex = 0;
        startIndex < roundsToSummarize.length;
        startIndex += SUMMARY_BATCH_ROUNDS
      ) {
        const batchRounds = roundsToSummarize.slice(
          startIndex,
          startIndex + SUMMARY_BATCH_ROUNDS,
        );

        memorySummary = await this.mergeConversationMemory(
          memorySummary,
          batchRounds,
        );
        summarizedUntilMessageId = this.getRoundMaxMessageId(
          batchRounds[batchRounds.length - 1],
        );
        conversation.memorySummary = memorySummary;
        conversation.summarizedUntilMessageId = summarizedUntilMessageId;
        conversation.memoryUpdatedAt = new Date();
        await this.conversationRepo.save(conversation);
      }

      unsummarizedRounds = completedRounds.filter(
        (round) => this.getRoundMaxMessageId(round) > summarizedUntilMessageId,
      );
    }

    return { memorySummary, recentRounds: unsummarizedRounds };
  }

  /** 合并对话摘要（调用摘要模型） */
  private async mergeConversationMemory(
    memorySummary: string,
    rounds: CompletedConversationRound[],
  ) {
    const response = await this.summaryModel.invoke([
      new SystemMessage(CONVERSATION_SUMMARY_SYSTEM_PROMPT),
      new HumanMessage(buildConversationSummaryPrompt(memorySummary, rounds)),
    ]);
    const nextSummary = this.extractChunkContent(response.content).trim();
    if (!nextSummary) {
      throw new Error('Summary model returned empty content');
    }
    return nextSummary;
  }

  /** 提取模型分片文本 */
  extractChunkContent(content: unknown) {
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
        ) {
          return part.text;
        }
        return '';
      })
      .join('');
  }

  /** 生成记忆系统提示词 */
  buildMemorySystemMessage(memorySummary: string) {
    if (!memorySummary) return null;
    return new SystemMessage(
      `${CONVERSATION_MEMORY_SYSTEM_PROMPT}${memorySummary}`,
    );
  }
}
