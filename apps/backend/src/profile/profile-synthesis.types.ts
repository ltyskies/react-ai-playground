/**
 * @file profile-synthesis.types.ts
 * @description 画像合成 Agent 循环的全部类型定义
 */

import type { ProfileObservation } from './profile-observation.type';

// ─── Synthesizer Agent 输出 ────────────────────────────────────────

/** Synthesizer Agent 的结构化输出 */
export interface SynthesizerOutput {
  /** 完整的 Markdown 格式用户画像（5 个标准 section） */
  profile: string;
  /** 本次合并过程中执行的所有原子操作清单 */
  operations: SynthesizerOperation[];
}

/** Synthesizer 报告的单个合并操作 */
export type SynthesizerOperation =
  | { action: 'keep'; category: string; fact: string; rationale: string }
  | {
      action: 'add';
      category: string;
      fact: string;
      evidence: string;
      rationale: string;
    }
  | {
      action: 'update';
      category: string;
      old_fact: string;
      new_fact: string;
      evidence: string;
      rationale: string;
    }
  | { action: 'remove'; category: string; fact: string; rationale: string }
  | {
      action: 'merge';
      category: string;
      facts: string[];
      merged_fact: string;
      rationale: string;
    }
  | {
      action: 'conflict_defer';
      category: string;
      observation_a: string;
      observation_b: string;
      note: string;
    };

// ─── Reviewer Agent 输出 ───────────────────────────────────────────

/** Reviewer Agent 的结构化输出 */
export interface ReviewerOutput {
  /** 是否批准本次画像合并结果 */
  approved: boolean;
  /** 质量评分（0-100） */
  score: number;
  /** 必须修复的问题列表 */
  critical_issues: ReviewerIssue[];
  /** 改进建议 */
  suggestions: string[];
}

/** Reviewer 发现的具体问题 */
export interface ReviewerIssue {
  /** 严重程度 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 问题类型 */
  type:
    | 'hallucination'
    | 'missing_fact'
    | 'contradiction'
    | 'format'
    | 'over_merge'
    | 'stale_info';
  /** 问题描述 */
  detail: string;
  /** 影响的画像 section */
  affected_section?: string;
  /** 建议的修复方案 */
  suggested_fix?: string;
}

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
