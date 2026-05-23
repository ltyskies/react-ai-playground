/**
 * @file profile-extraction.service.ts
 * @description 用户画像提取两阶段管道
 *   Phase 1：从各会话增量提取偏好事实
 *   Phase 2：将事实合并为完整 Markdown 画像
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { User } from '../user/entities/user.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { createSummaryModel } from '../chat/config';
import { ConversationSummaryService } from '../chat/services/conversation-summary.service';
import { MessageService } from '../chat/services/message.service';
import { ProfileSynthesisService } from './profile-synthesis.service';
import { FACT_EXTRACTOR_SYSTEM_PROMPT } from './prompts/fact-extractor.prompt';
import { buildFactExtractorPrompt } from './prompts/fact-extractor.builder';
import type { ProfileObservation } from './profile-observation.type';
import type { ProfileFactExtractionResult } from './profile-observation.type';
import {
  PROFILE_FACT_EXTRACTION_BATCH_ROUNDS,
  PROFILE_EXTRACTION_MIN_ROUNDS,
} from './profile-synthesis.constants';

@Injectable()
export class ProfileExtractionService {
  private summaryModel: ChatOpenAI;

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    private configService: ConfigService,
    private conversationSummaryService: ConversationSummaryService,
    private messageService: MessageService,
    private profileSynthesisService: ProfileSynthesisService,
  ) {
    this.summaryModel = createSummaryModel(this.configService);
  }

  /** 用户级画像提取入口 */
  async extractProfilesForUser(userId: number) {
    console.log(`[画像] 用户 ${userId} 开始画像提取`);

    const conversations = await this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'ASC' },
    });

    console.log(`[画像] 用户 ${userId} 共 ${conversations.length} 个会话`);

    const allObservations: ProfileObservation[] = [];

    const extractResults = await asyncPool(5, conversations, (conversation) =>
      this.extractFactsFromConversation(userId, conversation.id),
    );
    for (const result of extractResults) {
      if (result !== null) {
        allObservations.push(...result);
      }
    }

    console.log(
      `[画像] Phase 1 完成，用户 ${userId} 共提取 ${allObservations.length} 条事实`,
    );

    await this.synthesizeProfile(userId, allObservations);
  }

  /** Phase 1：从单个会话增量提取事实 */
  private async extractFactsFromConversation(
    userId: number,
    conversationId: number,
  ): Promise<ProfileObservation[]> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: conversationId },
    });
    if (!conversation) return [];

    const history =
      await this.messageService.getConversationRuntimeMessages(conversationId);
    const allRounds =
      this.conversationSummaryService.collectCompletedRounds(history);

    if (allRounds.length === 0) {
      console.log(`[画像] 会话 ${conversationId} 无已完成轮次，跳过`);
      return [];
    }

    const summarizedUntilId = conversation.profileExtractedUntilMessageId || 0;
    const newRounds = allRounds.filter(
      (round) =>
        this.conversationSummaryService.getRoundMaxMessageId(round) >
        summarizedUntilId,
    );

    console.log(
      `[画像] 会话 ${conversationId}: 总轮次 ${allRounds.length}, 新轮次 ${newRounds.length}, 已提取至消息ID ${summarizedUntilId}`,
    );

    if (newRounds.length < PROFILE_EXTRACTION_MIN_ROUNDS) {
      console.log(
        `[画像] 会话 ${conversationId} 新轮次不足 ${PROFILE_EXTRACTION_MIN_ROUNDS}，跳过`,
      );
      return [];
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const currentProfileSummary = user?.personalProfile
      ? (user.personalProfile as { content?: string }).content?.trim() || ''
      : '';

    // 预先构建所有批次
    const batches: (typeof newRounds)[] = [];
    for (
      let startIndex = 0;
      startIndex < newRounds.length;
      startIndex += PROFILE_FACT_EXTRACTION_BATCH_ROUNDS
    ) {
      batches.push(
        newRounds.slice(
          startIndex,
          startIndex + PROFILE_FACT_EXTRACTION_BATCH_ROUNDS,
        ),
      );
    }

    // 并发调 LLM 提取所有批次的事实
    const batchResults = await asyncPool(
      5,
      batches,
      async (batchRounds, batchIndex) => {
        try {
          const response = await this.summaryModel.invoke([
            new SystemMessage(FACT_EXTRACTOR_SYSTEM_PROMPT),
            new HumanMessage(
              buildFactExtractorPrompt(currentProfileSummary, batchRounds),
            ),
          ]);

          const result = this.parseObservationJson(
            this.conversationSummaryService.extractChunkContent(
              response.content,
            ),
          );
          if (result) {
            console.log(
              `[画像] 会话 ${conversationId} 批次 ${batchIndex + 1} 提取 ${result.observations.length} 条事实`,
            );
            return result.observations;
          } else {
            console.log(
              `[画像] 会话 ${conversationId} 批次 ${batchIndex + 1} JSON 解析失败`,
            );
            return [];
          }
        } catch (error) {
          console.error(
            `Phase 1 failed for conversation ${conversationId} batch ${batchIndex + 1}:`,
            error,
          );
          return [];
        }
      },
    );

    const allObservations: ProfileObservation[] = batchResults
      .filter((r): r is ProfileObservation[] => r !== null)
      .flat();

    const lastRoundMaxId = this.conversationSummaryService.getRoundMaxMessageId(
      newRounds[newRounds.length - 1],
    );
    await this.conversationRepo.update(conversationId, {
      profileExtractedUntilMessageId: lastRoundMaxId,
      profileExtractedAt: new Date(),
    });

    return allObservations;
  }

  /** Phase 2：合成用户画像 */
  private async synthesizeProfile(
    userId: number,
    allObservations: ProfileObservation[],
  ) {
    try {
      const diff = await this.profileSynthesisService.synthesize(
        userId,
        allObservations,
      );
      if (diff) {
        console.log(
          `[画像] 用户 ${userId} 画像已更新 (v${diff.previousVersion} -> v${diff.version}, ` +
            `score=${diff.finalReviewScore}, iterations=${diff.iterationsUsed})`,
        );
      }
    } catch (error) {
      console.error(
        `Phase 2 profile synthesis failed for user ${userId}:`,
        error,
      );
    }
  }

  /** 解析模型输出的 JSON */
  private parseObservationJson(
    rawText: string,
  ): ProfileFactExtractionResult | null {
    try {
      let jsonText = rawText.trim();
      const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }
      const parsed = JSON.parse(jsonText);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray(parsed.observations)
      ) {
        return null;
      }
      return parsed as ProfileFactExtractionResult;
    } catch (error) {
      console.error('Failed to parse Phase 1 observation JSON:', error);
      return null;
    }
  }
}

/**
 * 并发执行异步任务池，最多同时运行 limit 个。
 * 单个任务失败返回 null，不中断其他任务。
 */
async function asyncPool<T, R>(
  limit: number,
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const results = new Array<R | null>(items.length).fill(null);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        console.error(`asyncPool task ${i} failed:`, err);
        // 保持 null
      }
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
