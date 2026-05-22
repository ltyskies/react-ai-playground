/**
 * @file profile-synthesis.constants.ts
 * @description 画像合成 Agent 循环的阈值与限制常量
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
