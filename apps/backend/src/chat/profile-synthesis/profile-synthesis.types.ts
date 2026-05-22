/**
 * @file profile-synthesis.types.ts
 * @description 画像合成 Agent 循环的全部类型定义，LLM 输出使用 Zod schema 校验
 */

import { z } from 'zod';
import type { ProfileObservation } from '../types/profile-observation.type';

// ─── Synthesizer Agent 输出 ────────────────────────────────────────

/** Synthesizer 报告的单个合并操作 */
export const SynthesizerOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('keep'),
    category: z.string(),
    fact: z.string(),
    rationale: z.string(),
  }),
  z.object({
    action: z.literal('add'),
    category: z.string(),
    fact: z.string(),
    evidence: z.string(),
    rationale: z.string(),
  }),
  z.object({
    action: z.literal('update'),
    category: z.string(),
    old_fact: z.string(),
    new_fact: z.string(),
    evidence: z.string(),
    rationale: z.string(),
  }),
  z.object({
    action: z.literal('remove'),
    category: z.string(),
    fact: z.string(),
    rationale: z.string(),
  }),
  z.object({
    action: z.literal('merge'),
    category: z.string(),
    facts: z.array(z.string()),
    merged_fact: z.string(),
    rationale: z.string(),
  }),
  z.object({
    action: z.literal('conflict_defer'),
    category: z.string(),
    observation_a: z.string(),
    observation_b: z.string(),
    note: z.string(),
  }),
]);

/** Synthesizer Agent 的结构化输出 */
export const SynthesizerOutputSchema = z.object({
  profile: z.string(),
  operations: z.array(SynthesizerOperationSchema),
});

export type SynthesizerOperation = z.infer<typeof SynthesizerOperationSchema>;
export type SynthesizerOutput = z.infer<typeof SynthesizerOutputSchema>;

// ─── Reviewer Agent 输出 ───────────────────────────────────────────

/** Reviewer 发现的具体问题 */
export const ReviewerIssueSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  type: z.enum([
    'hallucination',
    'missing_fact',
    'contradiction',
    'format',
    'over_merge',
    'stale_info',
  ]),
  detail: z.string(),
  affected_section: z.string().optional(),
  suggested_fix: z.string().optional(),
});

/** Reviewer Agent 的结构化输出 */
export const ReviewerOutputSchema = z.object({
  approved: z.boolean(),
  score: z.number().int().min(0).max(100),
  critical_issues: z.array(ReviewerIssueSchema),
  suggestions: z.array(z.string()),
});

export type ReviewerIssue = z.infer<typeof ReviewerIssueSchema>;
export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;

// ─── 确定性验证层输出 ──────────────────────────────────────────────

/** Schema 校验结果 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/** 幻觉检测结果 */
export interface HallucinationResult {
  potentialHallucinations: string[];
  count: number;
}

/** 事实覆盖率结果 */
export interface CoverageResult {
  coveredCount: number;
  totalCount: number;
  ratio: number;
  uncoveredObservations: ProfileObservation[];
  coverageByConfidence: Record<string, { covered: number; total: number }>;
}

/** 矛盾检测结果 */
export interface ContradictionResult {
  contradictions: Array<{ oldClaim: string; newClaim: string; topic: string }>;
}

/** 复合验证报告 */
export interface ValidationReport {
  schema: SchemaValidationResult;
  hallucinations: HallucinationResult;
  coverage: CoverageResult;
  contradictions: ContradictionResult;
  passed: boolean;
}

// ─── Profile 存储扩展 ──────────────────────────────────────────────

/** 画像变更记录 */
export interface ProfileDiff {
  version: number;
  previousVersion: number;
  operations: SynthesizerOperation[];
  fromContent: string;
  toContent: string;
  timestamp: string;
  iterationsUsed: number;
  finalReviewScore: number;
}

/** personalProfile JSON 列存储结构 */
export interface PersonalProfileData {
  content: string;
  updatedAt: string;
  version: number;
  lastDiff?: ProfileDiff;
  lastObservationFacts?: string[];
}
