/**
 * @file profile-synthesis.validator.ts
 * @description 确定性验证层 — 纯函数，不依赖 LLM，对画像合并结果进行工程化校验
 */

import type { ProfileObservation } from './profile-observation.type';
import type {
  SchemaValidationResult,
  HallucinationResult,
  CoverageResult,
  ContradictionResult,
  ValidationReport,
} from './profile-synthesis.types';
import {
  PROFILE_SECTIONS,
  EMPTY_SECTION_PLACEHOLDER,
  FUZZY_MATCH_THRESHOLD,
  MIN_FACT_COVERAGE,
  MAX_HALLUCINATIONS,
  MIN_PROFILE_LENGTH,
} from './profile-synthesis.constants';

// ─── 工具函数 ──────────────────────────────────────────────────────

/** 计算两个字符串的 Jaccard 相似度 */
function jaccardSimilarity(a: string, b: string): number {
  const normalize = (s: string) => {
    const tokens = s
      .toLowerCase()
      .replace(/[^\w一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    return new Set(tokens);
  };
  const setA = normalize(a);
  const setB = normalize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/** 从 Markdown 画像中提取所有事实声明（bullet points 后的文本） */
function extractClaims(profile: string): string[] {
  const claims: string[] = [];
  const lines = profile.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('-') &&
      !trimmed.startsWith(EMPTY_SECTION_PLACEHOLDER)
    ) {
      const claim = trimmed.replace(/^-\s*/, '').trim();
      if (claim.length > 0) {
        claims.push(claim);
      }
    }
  }
  return claims;
}

/** 将画像文本按 section 拆分 */
function splitSections(profile: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = profile.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }
      currentSection = line.trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }
  return sections;
}

// ─── Schema 校验 ───────────────────────────────────────────────────

/**
 * 验证画像 Markdown 结构是否合法
 * - 画像长度 >= MIN_PROFILE_LENGTH
 * - 5 个标准 section 标题完整存在
 * - 每个 section 有实际内容
 * - 无多余顶级标题
 */
export function validateProfileSchema(profile: string): SchemaValidationResult {
  const errors: string[] = [];

  if (!profile || profile.trim().length < MIN_PROFILE_LENGTH) {
    errors.push(`画像内容过短（最低 ${MIN_PROFILE_LENGTH} 字符）`);
    return { valid: false, errors };
  }

  const sections = splitSections(profile);
  const foundSections = [...sections.keys()];

  for (const expected of PROFILE_SECTIONS) {
    if (!foundSections.includes(expected)) {
      errors.push(`缺少必需的 section: ${expected}`);
    }
  }

  for (const section of foundSections) {
    if (!PROFILE_SECTIONS.includes(section)) {
      errors.push(`存在未定义的 section: ${section}`);
    }
  }

  for (const section of PROFILE_SECTIONS) {
    const content = sections.get(section);
    if (content !== undefined && content.length === 0) {
      errors.push(`Section 内容为空: ${section}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── 幻觉检测 ──────────────────────────────────────────────────────

/**
 * 检测画像中可能存在的幻觉声明
 * 每条声明须可追溯到 observation.fact/evidence 或旧画像中的声明
 */
export function detectHallucinations(
  profile: string,
  observations: ProfileObservation[],
  currentProfile: string,
): HallucinationResult {
  const claims = extractClaims(profile);
  if (claims.length === 0) {
    return { potentialHallucinations: [], count: 0 };
  }

  const oldClaims = currentProfile ? extractClaims(currentProfile) : [];
  const observationTexts = [
    ...observations.map((o) => o.fact),
    ...observations.map((o) => o.evidence),
  ];

  const potentialHallucinations: string[] = [];

  for (const claim of claims) {
    let matched = false;

    for (const obsText of observationTexts) {
      if (jaccardSimilarity(claim, obsText) >= FUZZY_MATCH_THRESHOLD) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (const oldClaim of oldClaims) {
        if (jaccardSimilarity(claim, oldClaim) >= FUZZY_MATCH_THRESHOLD) {
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      potentialHallucinations.push(claim);
    }
  }

  return { potentialHallucinations, count: potentialHallucinations.length };
}

// ─── 事实覆盖率 ────────────────────────────────────────────────────

/**
 * 计算 observation 被画像覆盖的比例
 */
export function computeFactCoverage(
  profile: string,
  observations: ProfileObservation[],
): CoverageResult {
  if (observations.length === 0) {
    return {
      coveredCount: 0,
      totalCount: 0,
      ratio: 1,
      uncoveredObservations: [],
      coverageByConfidence: {},
    };
  }

  const claims = extractClaims(profile);
  let coveredCount = 0;
  const uncoveredObservations: ProfileObservation[] = [];
  const confidenceStats: Record<string, { covered: number; total: number }> =
    {};

  for (const obs of observations) {
    confidenceStats[obs.confidence] ??= { covered: 0, total: 0 };
    confidenceStats[obs.confidence].total++;

    let matched = false;
    for (const claim of claims) {
      if (
        jaccardSimilarity(obs.fact, claim) >= FUZZY_MATCH_THRESHOLD ||
        jaccardSimilarity(obs.evidence, claim) >= FUZZY_MATCH_THRESHOLD
      ) {
        matched = true;
        break;
      }
    }

    if (matched) {
      coveredCount++;
      confidenceStats[obs.confidence].covered++;
    } else {
      uncoveredObservations.push(obs);
    }
  }

  return {
    coveredCount,
    totalCount: observations.length,
    ratio: coveredCount / observations.length,
    uncoveredObservations,
    coverageByConfidence: confidenceStats,
  };
}

// ─── 矛盾检测 ──────────────────────────────────────────────────────

/** 否定词模式（中文） */
const NEGATION_PATTERNS = /不|没|非|否|禁止|避免|停止|废弃|移除|删除|无|未/;

/**
 * 检测新旧画像之间的潜在矛盾
 * 策略：对比新旧画像的 claims，查找同 topic 但语义相反的声明对
 */
export function detectContradictions(
  profile: string,
  currentProfile: string,
): ContradictionResult {
  const contradictions: Array<{
    oldClaim: string;
    newClaim: string;
    topic: string;
  }> = [];

  if (!currentProfile) return { contradictions };

  const newClaims = extractClaims(profile);
  const oldClaims = extractClaims(currentProfile);

  for (const newClaim of newClaims) {
    for (const oldClaim of oldClaims) {
      const sim = jaccardSimilarity(newClaim, oldClaim);
      // 高相似度但一个有否定词一个没有 → 可能矛盾
      if (sim >= FUZZY_MATCH_THRESHOLD * 1.5) {
        const oldHasNeg = NEGATION_PATTERNS.test(oldClaim);
        const newHasNeg = NEGATION_PATTERNS.test(newClaim);
        if (oldHasNeg !== newHasNeg) {
          const topic = extractTopic(newClaim, oldClaim);
          contradictions.push({ oldClaim, newClaim, topic });
        }
      }
    }
  }

  return { contradictions };
}

/** 从两个声明中提取共同 topic（简化：取共同关键词） */
function extractTopic(a: string, b: string): string {
  const wordsA = new Set(
    a
      .toLowerCase()
      .replace(/[^\w一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .replace(/[^\w一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
  const common = [...wordsA].filter((w) => wordsB.has(w));
  return common.slice(0, 3).join(', ') || '未知话题';
}

// ─── 复合验证报告 ─────────────────────────────────────────────────

/**
 * 执行全部确定性校验，返回复合验证报告
 */
export function validateProfile(
  profile: string,
  observations: ProfileObservation[],
  currentProfile: string,
): ValidationReport {
  const schema = validateProfileSchema(profile);
  const hallucinations = detectHallucinations(
    profile,
    observations,
    currentProfile,
  );
  const coverage = computeFactCoverage(profile, observations);
  const contradictions = detectContradictions(profile, currentProfile);

  const passed =
    schema.valid &&
    hallucinations.count <= MAX_HALLUCINATIONS &&
    coverage.ratio >= MIN_FACT_COVERAGE;

  return { schema, hallucinations, coverage, contradictions, passed };
}
