/**
 * @file profile-synthesis.constants.ts
 * @description 画像模块常量：合成 Agent 循环阈值与提取控制参数
 */

/** Synthesize-Review 最大迭代次数 */
export const MAX_SYNTHESIS_ITERATIONS = 3;

/** Reviewer 最低批准分数（0-100） */
export const MIN_APPROVAL_SCORE = 70;

/** 最低事实覆盖率阈值（0-1），低于此值验证不通过 */
export const MIN_FACT_COVERAGE = 0.7;

/** 最大允许的潜在幻觉数，超过此值验证不通过 */
export const MAX_HALLUCINATIONS = 3;

/** Jaccard 相似度阈值（0-1），用于模糊匹配声明是否被覆盖 */
export const FUZZY_MATCH_THRESHOLD = 0.3;

/** 画像最低字符数，低于此值视为无效 */
export const MIN_PROFILE_LENGTH = 50;

/** 标准画像的 4 个 section 标题 */
export const PROFILE_SECTIONS = [
  '## 编码风格',
  '## 技术偏好',
  '## 沟通方式',
  '## 其他习惯',
];

/** 画像为空时的占位内容 */
export const EMPTY_SECTION_PLACEHOLDER = '- 暂无';

/** Phase 1 事实提取单批处理的轮次数。 */
export const PROFILE_FACT_EXTRACTION_BATCH_ROUNDS = 5;

/** 触发画像提取的最小新增轮次数。 */
export const PROFILE_EXTRACTION_MIN_ROUNDS = 3;
