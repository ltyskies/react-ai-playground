/**
 * @file profile-synthesis.types.ts
 * @description 画像合成 Agent 循环的全部类型定义
 */

import type { ProfileObservation } from '../types/profile-observation.type';

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
  /** 潜在幻觉声明列表 */
  potentialHallucinations: string[];
  /** 潜在幻觉数量 */
  count: number;
}

/** 事实覆盖率结果 */
export interface CoverageResult {
  /** 被覆盖的 observation 数量 */
  coveredCount: number;
  /** observation 总数 */
  totalCount: number;
  /** 覆盖率 (0-1) */
  ratio: number;
  /** 未被覆盖的 observation 列表 */
  uncoveredObservations: ProfileObservation[];
  /** 按置信度分组的覆盖率 */
  coverageByConfidence: Record<string, { covered: number; total: number }>;
}

/** 矛盾检测结果 */
export interface ContradictionResult {
  /** 检测到的矛盾对 */
  contradictions: Array<{ oldClaim: string; newClaim: string; topic: string }>;
}

/** 复合验证报告 */
export interface ValidationReport {
  schema: SchemaValidationResult;
  hallucinations: HallucinationResult;
  coverage: CoverageResult;
  contradictions: ContradictionResult;
  /** 全部校验通过时为 true */
  passed: boolean;
}

// ─── Profile 存储扩展 ──────────────────────────────────────────────

/** 画像变更记录 */
export interface ProfileDiff {
  /** 新版本号 */
  version: number;
  /** 上一版本号 */
  previousVersion: number;
  /** 本次合并执行的操作 */
  operations: SynthesizerOperation[];
  /** 变更前画像内容 */
  fromContent: string;
  /** 变更后画像内容 */
  toContent: string;
  /** 变更时间 (ISO 8601) */
  timestamp: string;
  /** 实际使用的迭代次数 */
  iterationsUsed: number;
  /** 最终 Reviewer 评分 */
  finalReviewScore: number;
}

/** personalProfile JSON 列存储结构 */
export interface PersonalProfileData {
  /** 画像 Markdown 文本 */
  content: string;
  /** 最近更新时间 (ISO 8601) */
  updatedAt: string;
  /** 累计版本号 */
  version: number;
  /** 最近一次变更的 diff */
  lastDiff?: ProfileDiff;
  /** 最近一次合并所使用的 observation.fact 快照（用于后续跟踪） */
  lastObservationFacts?: string[];
}
