/**
 * @file profile-observation.type.ts
 * @description Phase 1 事实提取的结构化输出类型定义
 */

/** 观察类别 */
export type ProfileObservationCategory =
  | 'coding_style'
  | 'tech_preference'
  | 'communication'
  | 'project_context'
  | 'other';

/** 置信度等级 */
export type ProfileObservationConfidence = 'high' | 'medium' | 'low';

/**
 * 单条用户偏好观察
 * @description 从对话中提取的原子化用户偏好事实
 */
export interface ProfileObservation {
  /** 所属类别 */
  category: ProfileObservationCategory;
  /** 单条简洁事实陈述 */
  fact: string;
  /** 置信度 */
  confidence: ProfileObservationConfidence;
  /** 来源证据，引用对话中的具体内容 */
  evidence: string;
}

/**
 * Phase 1 事实提取的完整输出
 */
export interface ProfileFactExtractionResult {
  /** 提取到的所有观察清单 */
  observations: ProfileObservation[];
}
