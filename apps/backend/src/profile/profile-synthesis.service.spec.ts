/**
 * @file profile-synthesis.service.spec.ts
 * @description ProfileSynthesisService 的单元测试
 */

let mockStructuredInvoke: jest.Mock;

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: () => ({
      invoke: (...args: unknown[]) => mockStructuredInvoke(...args),
    }),
  })),
}));

import { ProfileSynthesisService } from './profile-synthesis.service';
import type { ProfileObservation } from './profile-observation.type';

const VALID_PROFILE = `## 编码风格
- 使用 React + TypeScript 技术栈
- 偏好函数式组件和 Hooks

## 技术偏好
- 使用 Ant Design 作为 UI 组件库

## 沟通方式
- 偏好中文交流
- 期望详细的代码注释


## 其他习惯
- 暂无`;

const makeSynthesizerResponse = (profile: string) => ({
  profile,
  operations: [
    {
      action: 'keep' as const,
      category: 'coding_style',
      fact: '使用 React + TypeScript 技术栈',
      rationale: '仍然准确',
    },
  ],
});

const makeReviewerApprove = () => ({
  approved: true,
  score: 85,
  critical_issues: [],
  suggestions: ['可以再补充一些技术偏好细节'],
});

const makeReviewerReject = (score = 55) => ({
  approved: false,
  score,
  critical_issues: [
    {
      severity: 'high' as const,
      type: 'missing_fact' as const,
      detail: '缺少关于数据库偏好的 observation',
      affected_section: '技术偏好',
      suggested_fix: '在技术偏好中补充用户的数据存储偏好',
    },
  ],
  suggestions: ['下一次请更仔细地覆盖所有 high 置信度观察'],
});

const makeObservations = (count = 5): ProfileObservation[] =>
  Array.from({ length: count }, (_, i) => ({
    category: 'coding_style' as const,
    fact: `用户偏好 React 函数式组件 ${i + 1}`,
    confidence: 'high' as const,
    evidence: `对话中用户明确选择了函数式写法 ${i + 1}`,
  }));

describe('ProfileSynthesisService', () => {
  let service: ProfileSynthesisService;
  let userRepo: { findOne: jest.Mock; save: jest.Mock };
  let configService: { get: jest.Mock };
  let savedProfileData: Record<string, unknown> | null;

  beforeEach(() => {
    mockStructuredInvoke = jest.fn();

    savedProfileData = null;

    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        personalProfile: {
          content: '',
          updatedAt: '',
          version: 0,
        },
      }),
      save: jest
        .fn()
        .mockImplementation(
          async (user: { personalProfile: Record<string, unknown> }) => {
            savedProfileData = user.personalProfile;
          },
        ),
    };

    configService = {
      get: jest.fn((key: string) => {
        const configMap: Record<string, string> = {
          'ai.deepseek.apiKey': 'test-key',
          'ai.deepseek.baseUrl': 'http://localhost:1234',
          'ai.deepseek.model': 'deepseek-test',
        };
        return configMap[key];
      }),
    };

    service = new ProfileSynthesisService(
      userRepo as any,
      configService as any,
    );
  });

  // ─── 基础路径测试 ─────────────────────────────────────────────────

  it('空 observations 应直接返回 null', async () => {
    const result = await service.synthesize(1, []);
    expect(result).toBeNull();
    expect(mockStructuredInvoke).not.toHaveBeenCalled();
  });

  it('用户不存在时应返回 null', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const observations = makeObservations(1);
    const result = await service.synthesize(999, observations);
    expect(result).toBeNull();
  });

  // ─── Agent 循环测试 ──────────────────────────────────────────────

  it('单轮成功路径：Synthesizer 合法输出 + Reviewer 批准', async () => {
    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerApprove());

    const observations = makeObservations(3);
    const result = await service.synthesize(1, observations);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.previousVersion).toBe(0);
    expect(result!.iterationsUsed).toBe(1);
    expect(result!.finalReviewScore).toBe(85);
    expect(result!.toContent).toBe(VALID_PROFILE);
    expect(userRepo.save).toHaveBeenCalledTimes(1);
    expect(mockStructuredInvoke).toHaveBeenCalledTimes(2); // Synthesizer + Reviewer
  });

  it('两轮精炼路径：第1轮驳回 → 第2轮批准', async () => {
    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerReject(55))
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerApprove());

    const observations = makeObservations(3);
    const result = await service.synthesize(1, observations);

    expect(result).not.toBeNull();
    expect(result!.iterationsUsed).toBe(2);
    expect(result!.finalReviewScore).toBe(85);
    expect(mockStructuredInvoke).toHaveBeenCalledTimes(4);
  });

  it('达到最大迭代次数：Reviewer 始终拒绝 → 取最优结果', async () => {
    // 3轮，每轮 reviewer 都拒绝但分数递增
    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerReject(50))
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerReject(60))
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerReject(65));

    const observations = makeObservations(3);
    const result = await service.synthesize(1, observations);

    expect(result).not.toBeNull();
    expect(result!.iterationsUsed).toBe(3);
    expect(result!.finalReviewScore).toBe(65); // 最佳分数
  });

  // ─── 容错测试 ────────────────────────────────────────────────────

  it('Synthesizer 结构化输出失败后恢复', async () => {
    mockStructuredInvoke
      .mockRejectedValueOnce(new Error('Structured output validation failed'))
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerApprove());

    const observations = makeObservations(3);
    const result = await service.synthesize(1, observations);

    expect(result).not.toBeNull();
    expect(result!.iterationsUsed).toBe(2); // 第2轮成功
  });

  it('Reviewer 结构化输出失败但验证通过时采纳 Synthesizer 结果', async () => {
    const minimalProfile = `## 编码风格
- 使用 React + TypeScript 技术栈

## 技术偏好
- 暂无

## 沟通方式
- 暂无


## 其他习惯
- 暂无`;

    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(minimalProfile))
      .mockRejectedValueOnce(new Error('Invalid reviewer output'));

    const matchingObservations: ProfileObservation[] = [
      {
        category: 'coding_style',
        fact: '使用 React + TypeScript 技术栈',
        confidence: 'high',
        evidence: '用户多次提到 React 和 TypeScript',
      },
    ];
    const result = await service.synthesize(1, matchingObservations);

    expect(result).not.toBeNull();
    // 验证通过则采纳（保守评分 80）
    expect(result!.finalReviewScore).toBe(80);
  });

  it('结构化输出连续失败 2 次应中止并返回 null', async () => {
    mockStructuredInvoke
      .mockRejectedValue(new Error('fail 1'))
      .mockRejectedValue(new Error('fail 2'));

    const observations = makeObservations(3);
    const result = await service.synthesize(1, observations);

    expect(result).toBeNull();
    expect(mockStructuredInvoke).toHaveBeenCalledTimes(2);
  });

  // ─── Profile 版本与存储测试 ──────────────────────────────────────

  it('应正确递增版本号', async () => {
    userRepo.findOne.mockResolvedValue({
      id: 1,
      personalProfile: {
        content: '旧画像内容',
        updatedAt: '2026-01-01T00:00:00.000Z',
        version: 5,
      },
    });

    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerApprove());

    const result = await service.synthesize(1, makeObservations(3));

    expect(result!.version).toBe(6);
    expect(result!.previousVersion).toBe(5);
  });

  it('存储的 personalProfile 应包含 diff 和 fact 快照', async () => {
    mockStructuredInvoke
      .mockResolvedValueOnce(makeSynthesizerResponse(VALID_PROFILE))
      .mockResolvedValueOnce(makeReviewerApprove());

    await service.synthesize(1, makeObservations(3));

    expect(savedProfileData).not.toBeNull();
    const data = savedProfileData as any;
    expect(data.content).toBe(VALID_PROFILE);
    expect(data.version).toBe(1);
    expect(data.lastDiff).toBeDefined();
    expect(data.lastDiff.version).toBe(1);
    expect(data.lastObservationFacts).toBeDefined();
    expect(Array.isArray(data.lastObservationFacts)).toBe(true);
  });
});
