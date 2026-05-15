/**
 * @file index.ts
 * @description 画像合成模块 barrel 导出
 */

export { ProfileSynthesisService } from './profile-synthesis.service';
export { validateProfile } from './profile-synthesis.validator';
export type {
  SynthesizerOutput,
  SynthesizerOperation,
  ReviewerOutput,
  ReviewerIssue,
  ValidationReport,
  ProfileDiff,
  PersonalProfileData,
} from './profile-synthesis.types';
