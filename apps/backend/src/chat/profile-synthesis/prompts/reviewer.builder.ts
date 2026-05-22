/**
 * @file reviewer.builder.ts
 * @description Reviewer Agent 用户提示词构建器
 */

import type { ProfileObservation } from '../../types/profile-observation.type';
import type { ValidationReport } from '../profile-synthesis.types';

/**
 * 构建 Reviewer 的用户提示词
 * @param proposedProfile - Synthesizer 生成的提议画像
 * @param observations - 原始 observations
 * @param currentProfile - 当前画像（审阅前版本）
 * @param validationReport - 确定性验证报告
 * @returns 发给 Reviewer Agent 的完整用户提示词
 */
export function buildReviewerPrompt(
  proposedProfile: string,
  observations: ProfileObservation[],
  currentProfile: string,
  validationReport: ValidationReport,
): string {
  const validationSummary = buildValidationSummary(validationReport);
  const observationsSummary = buildObservationsSummary(observations);

  return `请审阅以下由 Synthesizer 生成的画像合并结果。

## 提议的更新后画像
${proposedProfile}

## 当前画像（合并前）
${currentProfile || '暂无，这是首次合成。'}

## 确定性验证报告
${validationSummary}

## 原始观察清单（共 ${observations.length} 条）
${observationsSummary}

请对画像合并结果进行质量审阅。`;
}

/** 将验证报告格式化为 Reviewer 可读的摘要 */
function buildValidationSummary(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push(`Schema 校验: ${report.schema.valid ? '通过' : '失败'}`);
  if (!report.schema.valid) {
    lines.push(`  错误: ${report.schema.errors.join('; ')}`);
  }

  lines.push(`幻觉检测: ${report.hallucinations.count} 条潜在幻觉`);
  if (report.hallucinations.count > 0) {
    for (const h of report.hallucinations.potentialHallucinations) {
      lines.push(`  - "${h}"`);
    }
  }

  lines.push(
    `事实覆盖率: ${report.coverage.coveredCount}/${report.coverage.totalCount} (${(report.coverage.ratio * 100).toFixed(0)}%)`,
  );
  if (report.coverage.uncoveredObservations.length > 0) {
    lines.push('  未覆盖的观察:');
    for (const obs of report.coverage.uncoveredObservations) {
      lines.push(`  - [${obs.confidence}] ${obs.fact}`);
    }
  }

  lines.push(
    `矛盾检测: ${report.contradictions.contradictions.length} 对潜在矛盾`,
  );
  for (const c of report.contradictions.contradictions) {
    lines.push(`  - 话题 "${c.topic}": 旧"${c.oldClaim}" ↔ 新"${c.newClaim}"`);
  }

  lines.push(`整体验证: ${report.passed ? '通过' : '未通过'}`);

  return lines.join('\n');
}

/** 将 observations 格式化为编号清单 */
function buildObservationsSummary(observations: ProfileObservation[]): string {
  if (observations.length === 0) return '(无观察)';

  return observations
    .map(
      (obs, index) =>
        `${index + 1}. [${obs.category}] [${obs.confidence}] ${obs.fact}\n   证据: ${obs.evidence}`,
    )
    .join('\n\n');
}
