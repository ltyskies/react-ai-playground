/**
 * @file profile-synthesis.service.ts
 * @description 画像合成 Agent 循环编排服务
 *
 * 编排 Synthesizer → 验证层 → Reviewer 的迭代循环：
 * 1. Synthesizer Agent 基于 observations + 当前画像 + Reviewer 反馈生成合并方案
 * 2. 确定性验证层对输出做 schema、幻觉、覆盖率、矛盾校验
 * 3. Reviewer Agent 审阅合并结果并给出质量评估
 * 4. 如未批准且未达最大迭代次数，将 Reviewer 反馈注入下一轮 Synthesizer
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { User } from '../user/entities/user.entity';
import { createSummaryModel } from '../chat/config';
import type { ProfileObservation } from './profile-observation.type';
import { validateProfile } from './profile-synthesis.validator';
import { SYNTHESIZER_SYSTEM_PROMPT } from './prompts/synthesizer.prompt';
import { buildSynthesizerPrompt } from './prompts/synthesizer.builder';
import { REVIEWER_SYSTEM_PROMPT } from './prompts/reviewer.prompt';
import { buildReviewerPrompt } from './prompts/reviewer.builder';
import { MAX_SYNTHESIS_ITERATIONS } from './profile-synthesis.constants';
import type {
  SynthesizerOutput,
  ReviewerOutput,
  ProfileDiff,
  PersonalProfileData,
} from './profile-synthesis.types';

@Injectable()
export class ProfileSynthesisService {
  private summaryModel: ChatOpenAI;

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
  ) {
    this.summaryModel = createSummaryModel(this.configService);
  }

  /**
   * 画像合成主入口
   * @description 编排 Synthesizer → 验证 → Reviewer 迭代循环
   * @param userId - 用户 ID
   * @param observations - Phase 1 提取的全部 observation
   * @returns 变更 diff（保存成功）或 null（无变更/失败）
   */
  async synthesize(
    userId: number,
    observations: ProfileObservation[],
  ): Promise<ProfileDiff | null> {
    if (observations.length === 0) {
      console.log(`[画像] 用户 ${userId} 无新事实，跳过画像合成`);
      return null;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const profileData = this.extractProfileData(user);
    const currentProfile = profileData.content;
    const currentVersion = profileData.version;

    let bestOutput: SynthesizerOutput | null = null;
    let bestScore = -1;
    let reviewerFeedback: string | null = null;
    let iterationsUsed = 0;
    let consecutiveJsonFailures = 0;

    for (let i = 1; i <= MAX_SYNTHESIS_ITERATIONS; i++) {
      iterationsUsed = i;
      console.log(
        `[画像] 用户 ${userId} 合成迭代 ${i}/${MAX_SYNTHESIS_ITERATIONS}`,
      );

      // Step 1: Synthesizer
      const synthOutput = await this.runSynthesizer(
        currentProfile,
        observations,
        reviewerFeedback,
      );
      if (!synthOutput) {
        consecutiveJsonFailures++;
        console.warn(
          `[画像] 用户 ${userId} 第 ${i} 轮 Synthesizer JSON 解析失败 ` +
            `(连续 ${consecutiveJsonFailures} 次)`,
        );
        if (consecutiveJsonFailures >= 2) {
          console.error(`[画像] 用户 ${userId} JSON 连续失败，中止合成`);
          break;
        }
        continue;
      }
      consecutiveJsonFailures = 0;

      // Step 2: 确定性验证
      const validationReport = validateProfile(
        synthOutput.profile,
        observations,
        currentProfile,
      );

      // Step 3: Reviewer
      const reviewOutput = await this.runReviewer(
        synthOutput.profile,
        observations,
        currentProfile,
        validationReport,
      );
      if (!reviewOutput) {
        console.warn(`[画像] 用户 ${userId} 第 ${i} 轮 Reviewer JSON 解析失败`);
        // Reviewer 解析失败 → 信任验证报告决定是否采纳
        if (validationReport.passed) {
          bestOutput = synthOutput;
          bestScore = 80; // 保守评分
          break;
        }
        continue;
      }

      // Step 4: 追踪最优结果
      if (reviewOutput.score > bestScore) {
        bestScore = reviewOutput.score;
        bestOutput = synthOutput;
      }

      // Step 5: 终止检查
      if (reviewOutput.approved) {
        console.log(
          `[画像] 用户 ${userId} 第 ${i} 轮 Reviewer 批准 (score=${reviewOutput.score})`,
        );
        break;
      }

      console.log(
        `[画像] 用户 ${userId} 第 ${i} 轮 Reviewer 驳回 (score=${reviewOutput.score})，` +
          `issues=${reviewOutput.critical_issues.length}`,
      );

      // Step 6: 准备反馈
      reviewerFeedback = this.formatReviewerFeedback(reviewOutput);
    }

    // 保存最优结果
    if (bestOutput) {
      await this.saveProfile(
        user,
        bestOutput.profile,
        currentProfile,
        currentVersion,
        observations,
        bestOutput.operations,
        bestScore,
        iterationsUsed,
      );

      return {
        version: currentVersion + 1,
        previousVersion: currentVersion,
        operations: bestOutput.operations,
        fromContent: currentProfile,
        toContent: bestOutput.profile,
        timestamp: new Date().toISOString(),
        iterationsUsed,
        finalReviewScore: bestScore,
      };
    }

    console.warn(`[画像] 用户 ${userId} 无有效合成结果，保留现有画像`);
    return null;
  }

  // ─── Private: Agent 调用 ────────────────────────────────────────

  /** 调用 Synthesizer Agent 并解析结构化输出 */
  private async runSynthesizer(
    currentProfile: string,
    observations: ProfileObservation[],
    reviewerFeedback: string | null,
  ): Promise<SynthesizerOutput | null> {
    try {
      const response = await this.summaryModel.invoke([
        new SystemMessage(SYNTHESIZER_SYSTEM_PROMPT),
        new HumanMessage(
          buildSynthesizerPrompt(
            currentProfile,
            observations,
            reviewerFeedback,
          ),
        ),
      ]);

      const rawText = this.extractContent(response.content);
      return this.parseModelJson<SynthesizerOutput>(
        rawText,
        (parsed): parsed is SynthesizerOutput =>
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as Record<string, unknown>).profile === 'string' &&
          Array.isArray((parsed as Record<string, unknown>).operations),
      );
    } catch (error) {
      console.error('Synthesizer agent call failed:', error);
      return null;
    }
  }

  /** 调用 Reviewer Agent 并解析结构化输出 */
  private async runReviewer(
    proposedProfile: string,
    observations: ProfileObservation[],
    currentProfile: string,
    validationReport: ReturnType<typeof validateProfile>,
  ): Promise<ReviewerOutput | null> {
    try {
      const response = await this.summaryModel.invoke([
        new SystemMessage(REVIEWER_SYSTEM_PROMPT),
        new HumanMessage(
          buildReviewerPrompt(
            proposedProfile,
            observations,
            currentProfile,
            validationReport,
          ),
        ),
      ]);

      const rawText = this.extractContent(response.content);
      return this.parseModelJson<ReviewerOutput>(
        rawText,
        (parsed): parsed is ReviewerOutput =>
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof (parsed as Record<string, unknown>).approved === 'boolean' &&
          typeof (parsed as Record<string, unknown>).score === 'number',
      );
    } catch (error) {
      console.error('Reviewer agent call failed:', error);
      return null;
    }
  }

  // ─── Private: JSON 解析 ─────────────────────────────────────────

  /**
   * 解析模型的结构化 JSON 输出
   * 兼容模型包裹 markdown fences 的情况
   */
  private parseModelJson<T>(
    rawText: string,
    validator: (parsed: unknown) => parsed is T,
  ): T | null {
    try {
      let jsonText = rawText.trim();

      const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonText = fenceMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText);

      if (!validator(parsed)) {
        console.error(
          'Model JSON failed validation. Parsed type:',
          typeof parsed,
          Array.isArray(parsed)
            ? '(array)'
            : Object.keys(parsed as object).join(', '),
        );
        return null;
      }

      return parsed;
    } catch (error) {
      console.error('Failed to parse model JSON:', error);
      return null;
    }
  }

  /** 从 LangChain 消息 content 中提取文本 */
  private extractContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part === 'object' && part !== null && 'text' in part) {
            return String((part as { text: unknown }).text);
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  /** 将 Reviewer 输出格式化为 Synthesizer 可理解的反馈字符串 */
  private formatReviewerFeedback(review: ReviewerOutput): string {
    const lines: string[] = [];

    if (review.critical_issues.length > 0) {
      for (const issue of review.critical_issues) {
        const section = issue.affected_section
          ? ` (${issue.affected_section})`
          : '';
        lines.push(
          `- [${issue.severity}] [${issue.type}]${section}: ${issue.detail}`,
        );
        if (issue.suggested_fix) {
          lines.push(`  建议修复: ${issue.suggested_fix}`);
        }
      }
    }

    if (review.suggestions.length > 0) {
      lines.push('');
      lines.push('改进建议:');
      for (const s of review.suggestions) {
        lines.push(`- ${s}`);
      }
    }

    return lines.join('\n');
  }

  /** 从 User 实体提取画像数据 */
  private extractProfileData(user: User): PersonalProfileData {
    if (user.personalProfile && typeof user.personalProfile === 'object') {
      const profile = user.personalProfile;
      return {
        content:
          typeof profile.content === 'string' ? profile.content.trim() : '',
        updatedAt:
          typeof profile.updatedAt === 'string' ? profile.updatedAt : '',
        version: typeof profile.version === 'number' ? profile.version : 0,
      };
    }
    return { content: '', updatedAt: '', version: 0 };
  }

  /** 持久化画像并记录 diff */
  private async saveProfile(
    user: User,
    profileContent: string,
    currentProfile: string,
    currentVersion: number,
    observations: ProfileObservation[],
    operations: SynthesizerOutput['operations'],
    finalReviewScore: number,
    iterationsUsed: number,
  ): Promise<void> {
    const newVersion = currentVersion + 1;

    const profileData: PersonalProfileData = {
      content: profileContent,
      updatedAt: new Date().toISOString(),
      version: newVersion,
      lastDiff: {
        version: newVersion,
        previousVersion: currentVersion,
        operations,
        fromContent: currentProfile,
        toContent: profileContent,
        timestamp: new Date().toISOString(),
        iterationsUsed,
        finalReviewScore,
      },
      lastObservationFacts: observations.map((o) => o.fact),
    };

    user.personalProfile = profileData as unknown as Record<string, unknown>;
    await this.userRepo.save(user);

    console.log(
      `[画像] 用户 ${user.id} 画像已更新 (v${currentVersion} -> v${newVersion}, ` +
        `score=${finalReviewScore}, iterations=${iterationsUsed})`,
    );
  }
}
