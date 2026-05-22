/**
 * @file index.ts
 * @description 画像合成模块 barrel 导出
 */

export { ProfileSynthesisService } from './profile-synthesis.service';
export { validateProfile } from './profile-synthesis.validator';
export { FACT_EXTRACTOR_SYSTEM_PROMPT } from './prompts/fact-extractor.prompt';
export { buildFactExtractorPrompt } from './prompts/fact-extractor.builder';
export type {
  SynthesizerOutput,
  SynthesizerOperation,
  ReviewerOutput,
  ReviewerIssue,
  ValidationReport,
  ProfileDiff,
  PersonalProfileData,
} from './profile-synthesis.types';
