/**
 * @file chat.service.spec.ts
 * @description ChatService 的单元测试
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';

let mockChatModelStream: jest.Mock;
let mockSummaryModelInvoke: jest.Mock;

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest
    .fn()
    .mockImplementation((options: { streaming?: boolean }) => ({
      stream: (...args: unknown[]) => mockChatModelStream(...args),
      invoke: (...args: unknown[]) =>
        options?.streaming
          ? Promise.resolve({ content: '' })
          : mockSummaryModelInvoke(...args),
    })),
}));

import { ChatService } from './chat.service';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { ConversationSummaryService } from './services/conversation-summary.service';
import { ProfileExtractionService } from '../profile/profile-extraction.service';
import { StreamGenerationService } from './services/stream-generation.service';
import { CodeGenerationOrchestratorService } from './services/code-generation-orchestrator.service';
import { CodeValidatorService } from './services/code-validator.service';
import { ProfileSynthesisService } from '../profile/profile-synthesis.service';
import { MessageRole, StreamStatus } from './entities/message.entity';
import type { ConversationWorkspace } from './types/conversation-workspace.type';
import type { GenerationEvent } from './types/generation-event.type';

const createAsyncStream = async function* () {
  yield { content: 'ok' };
};

const createThrowingAsyncStream = (error: Error) => {
  return (async function* () {
    yield { content: 'partial' };
    throw error;
  })();
};

type StoredMessage = {
  id: number;
  conversationId: number;
  role: MessageRole;
  requestId: string | null;
  streamStatus: StreamStatus;
  content: string;
  createdAt: Date;
};

type SeededRound = {
  requestId: string;
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
};

const MEMORY_SUMMARY = `## Current Goal
- Keep long conversation context stable
## Confirmed Requirements
- Summarize older rounds once the threshold is exceeded
## Key Constraints
- Keep the existing SSE protocol unchanged

## Important Files / APIs
- react-ai-playground/src/chat/chat.service.ts

## Decisions Made
- Persist summary only inside the backend

## Open Questions
- None
## User Preferences
- Prefer Chinese responses`;

const collectStream = async (stream: AsyncIterable<GenerationEvent>) => {
  let content = '';

  for await (const chunk of stream) {
    if (chunk.type === 'thinking' || chunk.type === 'file_end') {
      content += chunk.content;
    }
  }

  return content;
};

describe('ChatService', () => {
  let service: ChatService;
  let runtimeCacheService: {
    hydrate: jest.Mock;
    get: jest.Mock;
    getOrHydrate: jest.Mock;
    invalidate: jest.Mock;
  };
  let conversationRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };
  let messageRepo: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
  };
  let userRepo: {
    findOne: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let storedMessages: StoredMessage[];
  let seededRounds: SeededRound[];
  let nextMessageId: number;
  let nextTimestamp: number;
  let conversationState: {
    id: number;
    userId: number;
    title: string;
    workspaceSnapshot: ConversationWorkspace | null;
    memorySummary: string | null;
    summarizedUntilMessageId: number | null;
    memoryUpdatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const workspace: ConversationWorkspace = {
    files: {},
    selectedFileName: 'App.tsx',
    contextFiles: [],
  };

  const seedMessage = (payload: Omit<StoredMessage, 'id' | 'createdAt'>) => {
    const message: StoredMessage = {
      ...payload,
      id: nextMessageId++,
      createdAt: new Date(nextTimestamp++),
    };

    storedMessages.push(message);
    return message;
  };

  const seedCompletedRound = (roundNumber: number) => {
    const requestId = `round-${roundNumber}`;
    const userMessage = seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.USER,
      requestId,
      streamStatus: StreamStatus.COMPLETED,
      content: `user-${roundNumber}`,
    });
    const assistantMessage = seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.ASSISTANT,
      requestId,
      streamStatus: StreamStatus.COMPLETED,
      content: `assistant-${roundNumber}`,
    });
    const round = {
      requestId,
      userMessage,
      assistantMessage,
    };

    seededRounds.push(round);
    return round;
  };

  const getModelMessages = () => {
    const lastCall =
      mockChatModelStream.mock.calls[mockChatModelStream.mock.calls.length - 1];
    return (lastCall?.[0] || []) as Array<{ content: string }>;
  };

  const getSummaryPrompts = () =>
    mockSummaryModelInvoke.mock.calls.map(
      (call) => call[0][1].content as string,
    );

  const getRuntimeState = () => runtimeCacheService.get(conversationState.id);

  const findStoredMessage = (requestId: string, role: MessageRole) =>
    storedMessages.find(
      (message) =>
        message.conversationId === conversationState.id &&
        message.requestId === requestId &&
        message.role === role,
    );

  const findRuntimeMessage = (requestId: string, role: MessageRole) =>
    getRuntimeState()?.messages.find(
      (message) => message.requestId === requestId && message.role === role,
    );

  beforeEach(() => {
    mockChatModelStream = jest.fn().mockResolvedValue(createAsyncStream());
    mockSummaryModelInvoke = jest.fn().mockResolvedValue({
      content: MEMORY_SUMMARY,
    });

    storedMessages = [];
    seededRounds = [];
    nextMessageId = 1;
    nextTimestamp = Date.parse('2026-04-21T00:00:00.000Z');
    conversationState = {
      id: 3,
      userId: 1,
      title: 'New Chat',
      workspaceSnapshot: null,
      memorySummary: null,
      summarizedUntilMessageId: null,
      memoryUpdatedAt: null,
      createdAt: new Date(nextTimestamp++),
      updatedAt: new Date(nextTimestamp++),
    };

    conversationRepo = {
      findOne: jest.fn().mockImplementation(async ({ where, relations }) => {
        if (where.id !== conversationState.id) {
          return null;
        }

        if (relations?.includes('messages')) {
          return {
            ...conversationState,
            messages: storedMessages.map((message) => ({ ...message })),
          };
        }

        return { ...conversationState };
      }),
      save: jest.fn().mockImplementation(async (entity) => {
        conversationState = {
          ...conversationState,
          ...entity,
        };
        return { ...conversationState };
      }),
      create: jest.fn().mockImplementation((payload) => payload),
      find: jest.fn().mockResolvedValue([]),
    };

    messageRepo = {
      find: jest.fn().mockImplementation(async ({ where, order, take }) => {
        const sortedMessages = storedMessages
          .filter((message) => message.conversationId === where.conversationId)
          .slice()
          .sort((a, b) => {
            const primaryDirection = order?.createdAt === 'DESC' ? -1 : 1;
            const createdAtDiff =
              (a.createdAt.getTime() - b.createdAt.getTime()) *
              primaryDirection;

            if (createdAtDiff !== 0) {
              return createdAtDiff;
            }

            const secondaryDirection = order?.id === 'DESC' ? -1 : 1;
            return (a.id - b.id) * secondaryDirection;
          });

        return typeof take === 'number'
          ? sortedMessages.slice(0, take).map((message) => ({ ...message }))
          : sortedMessages.map((message) => ({ ...message }));
      }),
      save: jest.fn().mockImplementation(async (entity) => {
        const nextEntity: StoredMessage = {
          ...entity,
          id: entity.id ?? nextMessageId++,
          createdAt: entity.createdAt ?? new Date(nextTimestamp++),
        };
        const index = storedMessages.findIndex(
          (message) => message.id === nextEntity.id,
        );

        if (index >= 0) {
          storedMessages[index] = nextEntity;
        } else {
          storedMessages.push(nextEntity);
        }

        return { ...nextEntity };
      }),
      create: jest.fn().mockImplementation((payload) => ({
        ...payload,
        id: nextMessageId++,
        createdAt: new Date(nextTimestamp++),
      })),
      findOne: jest.fn().mockImplementation(async ({ where }) =>
        storedMessages.find(
          (message) =>
            message.conversationId === where.conversationId &&
            message.requestId === where.requestId &&
            message.role === where.role,
        ) || null,
      ),
      update: jest.fn().mockImplementation(async (where, payload) => {
        storedMessages = storedMessages.map((message) =>
          message.conversationId === where.conversationId &&
          message.role === where.role &&
          message.requestId === where.requestId
            ? {
                ...message,
                ...payload,
              }
            : message,
        );
      }),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        promptRules: 'Always answer in Chinese',
      }),
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

    let runtimeState: any = null;
    runtimeCacheService = {
      hydrate: jest.fn((conversationId, messages) => {
        runtimeState = {
          messages: messages.map((message) => ({ ...message })),
          hydratedAt: new Date(),
          lastAccessedAt: new Date(),
        };
        return runtimeState;
      }),
      get: jest.fn(() => runtimeState),
      getOrHydrate: jest.fn(async (conversationId, loader) => {
        if (!runtimeState) {
          runtimeCacheService.hydrate(conversationId, await loader());
        }
        return runtimeState;
      }),
      invalidate: jest.fn(),
    };

    const conversationService = new ConversationService(
      conversationRepo as any,
      userRepo as any,
      runtimeCacheService as any,
    );
    const messageService = new MessageService(
      messageRepo as any,
      runtimeCacheService as any,
    );
    const conversationSummaryService = new ConversationSummaryService(
      conversationRepo as any,
      configService as any,
    );
    const profileSynthesisService = {
      synthesize: jest.fn().mockResolvedValue(null),
    } as unknown as ProfileSynthesisService;
    const profileExtractionService = new ProfileExtractionService(
      userRepo as any,
      conversationRepo as any,
      configService as any,
      conversationSummaryService,
      messageService,
      profileSynthesisService,
    );
    const streamGenerationService = new StreamGenerationService(
      userRepo as any,
      configService as any,
      conversationService,
      messageService,
      conversationSummaryService,
      new CodeGenerationOrchestratorService(
        new CodeValidatorService(),
      ),
    );

    service = new ChatService(
      conversationService,
      messageService,
      conversationSummaryService,
      profileExtractionService,
      streamGenerationService,
    );
  });

  it('should hydrate runtime cache when loading conversation detail and keep response shape unchanged', async () => {
    seedCompletedRound(1);
    conversationState.memorySummary = MEMORY_SUMMARY;
    conversationState.summarizedUntilMessageId =
      seededRounds[0].assistantMessage.id;
    conversationState.memoryUpdatedAt = new Date('2026-04-21T00:00:00.000Z');

    const result = await service.getConversationDetail(1, 3);
    const detail = result.data as Record<string, unknown>;

    expect(detail).toMatchObject({
      id: 3,
      title: 'New Chat',
      workspaceSnapshot: null,
    });
    expect(detail).toHaveProperty('messages');
    expect(detail).not.toHaveProperty('memorySummary');
    expect(detail).not.toHaveProperty('summarizedUntilMessageId');
    expect(detail).not.toHaveProperty('memoryUpdatedAt');

    expect(runtimeCacheService.hydrate).toHaveBeenCalled();
  });

  it('should use warmed runtime cache for prompt history without reloading database history', async () => {
    seedCompletedRound(1);
    seedCompletedRound(2);

    await service.getConversationDetail(1, 3);
    messageRepo.find.mockClear();

    await service.generateStream(1, 3, 'Build a button', workspace, 'req-warm');

    expect(messageRepo.find).not.toHaveBeenCalled();

    const modelMessages = getModelMessages();
    const humanMessages = modelMessages.filter(
      (message) => message instanceof HumanMessage,
    );

    expect(humanMessages.map((message) => message.content)).toEqual([
      'user-1',
      'user-2',
      'Build a button',
    ]);
    expect(findRuntimeMessage('req-warm', MessageRole.USER)?.streamStatus).toBe(
      StreamStatus.PENDING,
    );
  });

  it('should hydrate runtime cache from database on cache miss before generating', async () => {
    seedCompletedRound(1);
    messageRepo.find.mockClear();

    await service.generateStream(1, 3, 'Build a button', workspace, 'req-cold');

    expect(messageRepo.find).toHaveBeenCalledTimes(1);
    expect(getRuntimeState()?.messages).toHaveLength(2);
    expect(findRuntimeMessage('round-1', MessageRole.USER)?.content).toBe(
      'user-1',
    );
    expect(runtimeCacheService.invalidate).toHaveBeenCalled();
  });

  it('should keep full raw history when completed rounds are at most 20', async () => {
    seedCompletedRound(1);
    seedCompletedRound(2);

    await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-short',
    );

    expect(mockSummaryModelInvoke).not.toHaveBeenCalled();

    const modelMessages = getModelMessages();
    const systemMessages = modelMessages.filter(
      (message) => message instanceof SystemMessage,
    );
    const humanMessages = modelMessages.filter(
      (message) => message instanceof HumanMessage,
    );

    expect(systemMessages).toHaveLength(2);
    expect(
      systemMessages.some((message) =>
        message.content.includes('Conversation compressed memory'),
      ),
    ).toBe(false);
    expect(humanMessages.map((message) => message.content)).toEqual([
      'user-1',
      'user-2',
      'Build a button',
    ]);
  });

  it('should summarize earlier rounds and keep only the latest 8 raw rounds', async () => {
    Array.from({ length: 21 }, (_, index) => seedCompletedRound(index + 1));

    await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-summary',
    );

    expect(mockSummaryModelInvoke).toHaveBeenCalledTimes(2);
    expect(conversationState.memorySummary).toBe(MEMORY_SUMMARY);
    expect(conversationState.summarizedUntilMessageId).toBe(
      seededRounds[12].assistantMessage.id,
    );

    const modelMessages = getModelMessages();
    const systemMessages = modelMessages.filter(
      (message) => message instanceof SystemMessage,
    );
    const humanMessages = modelMessages.filter(
      (message) => message instanceof HumanMessage,
    );

    expect(systemMessages).toHaveLength(3);
    expect(systemMessages[2].content).toContain(MEMORY_SUMMARY);
    expect(humanMessages.map((message) => message.content)).toEqual([
      'user-14',
      'user-15',
      'user-16',
      'user-17',
      'user-18',
      'user-19',
      'user-20',
      'user-21',
      'Build a button',
    ]);
  });

  it('should incrementally merge an existing summary and advance the summarized boundary', async () => {
    Array.from({ length: 22 }, (_, index) => seedCompletedRound(index + 1));
    conversationState.memorySummary = 'legacy summary';
    conversationState.summarizedUntilMessageId =
      seededRounds[11].assistantMessage.id;
    conversationState.memoryUpdatedAt = new Date('2026-04-21T00:00:00.000Z');

    await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-incremental',
    );

    expect(mockSummaryModelInvoke).toHaveBeenCalledTimes(1);
    expect(conversationState.memorySummary).toBe(MEMORY_SUMMARY);
    expect(conversationState.summarizedUntilMessageId).toBe(
      seededRounds[13].assistantMessage.id,
    );

    const modelMessages = getModelMessages();
    const systemMessages = modelMessages.filter(
      (message) => message instanceof SystemMessage,
    );
    const humanMessages = modelMessages.filter(
      (message) => message instanceof HumanMessage,
    );

    expect(systemMessages[2].content).toContain(MEMORY_SUMMARY);
    expect(humanMessages.map((message) => message.content)).toEqual([
      'user-15',
      'user-16',
      'user-17',
      'user-18',
      'user-19',
      'user-20',
      'user-21',
      'user-22',
      'Build a button',
    ]);
  });

  it('should ignore failed interrupted and pending history when building summary input', async () => {
    Array.from({ length: 21 }, (_, index) => seedCompletedRound(index + 1));
    seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.USER,
      requestId: 'req-failed',
      streamStatus: StreamStatus.FAILED,
      content: 'failed-user',
    });
    seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.ASSISTANT,
      requestId: 'req-failed',
      streamStatus: StreamStatus.FAILED,
      content: 'failed-assistant',
    });
    seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.USER,
      requestId: 'req-interrupted',
      streamStatus: StreamStatus.INTERRUPTED,
      content: 'interrupted-user',
    });
    seedMessage({
      conversationId: conversationState.id,
      role: MessageRole.USER,
      requestId: 'req-pending',
      streamStatus: StreamStatus.PENDING,
      content: 'pending-user',
    });

    await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-filtered',
    );

    const summaryPrompts = getSummaryPrompts().join('\n');

    expect(summaryPrompts).not.toContain('failed-user');
    expect(summaryPrompts).not.toContain('failed-assistant');
    expect(summaryPrompts).not.toContain('interrupted-user');
    expect(summaryPrompts).not.toContain('pending-user');
  });

  it('should fall back to the legacy 20-message window when summary generation fails', async () => {
    Array.from({ length: 21 }, (_, index) => seedCompletedRound(index + 1));
    mockSummaryModelInvoke.mockRejectedValue(new Error('summary failed'));
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await service.generateStream(
        1,
        3,
        'Build a button',
        workspace,
        'req-fallback',
      );

      expect(mockChatModelStream).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      const modelMessages = getModelMessages();
      const systemMessages = modelMessages.filter(
        (message) => message instanceof SystemMessage,
      );
      const humanMessages = modelMessages.filter(
        (message) => message instanceof HumanMessage,
      );

      expect(systemMessages).toHaveLength(2);
      expect(humanMessages.map((message) => message.content)).toEqual([
        'user-13',
        'user-14',
        'user-15',
        'user-16',
        'user-17',
        'user-18',
        'user-19',
        'user-20',
        'user-21',
        'Build a button',
      ]);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should replay completed assistant message from runtime cache when requestId already completed', async () => {
    seedCompletedRound(1);

    await service.getConversationDetail(1, 3);
    mockChatModelStream.mockClear();
    messageRepo.find.mockClear();

    const stream = await service.generateStream(
      1,
      3,
      'ignored because replay already exists',
      workspace,
      'round-1',
    );
    const replayedContent = await collectStream(stream);

    expect(replayedContent).toBe('assistant-1');
    expect(mockChatModelStream).not.toHaveBeenCalled();
    expect(messageRepo.find).not.toHaveBeenCalled();
  });

  it('should invalidate runtime cache after successful streaming', async () => {
    const stream = await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-success',
    );
    const content = await collectStream(stream);

    expect(content).toBe('ok');
    expect(runtimeCacheService.invalidate).toHaveBeenCalled();
    expect(
      findStoredMessage('req-success', MessageRole.USER)?.streamStatus,
    ).toBe(StreamStatus.COMPLETED);
    expect(
      findStoredMessage('req-success', MessageRole.ASSISTANT)?.content,
    ).toBe('ok');
  });

  it('should invalidate runtime cache when model streaming throws', async () => {
    mockChatModelStream.mockResolvedValue(
      createThrowingAsyncStream(new Error('stream failed')),
    );

    const stream = await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-failed-runtime',
    );

    await expect(collectStream(stream)).rejects.toThrow('stream failed');
    expect(runtimeCacheService.invalidate).toHaveBeenCalled();
    expect(
      findStoredMessage('req-failed-runtime', MessageRole.USER)?.streamStatus,
    ).toBe(StreamStatus.FAILED);
  });

  it('should invalidate runtime cache when request is aborted', async () => {
    const abortController = new AbortController();
    const stream = await service.generateStream(
      1,
      3,
      'Build a button',
      workspace,
      'req-interrupted-runtime',
      {
        signal: abortController.signal,
      },
    );

    abortController.abort();
    const content = await collectStream(stream);

    expect(content).toBe('');
    expect(runtimeCacheService.invalidate).toHaveBeenCalled();
    expect(
      findStoredMessage('req-interrupted-runtime', MessageRole.USER)
        ?.streamStatus,
    ).toBe(StreamStatus.INTERRUPTED);
  });
});
