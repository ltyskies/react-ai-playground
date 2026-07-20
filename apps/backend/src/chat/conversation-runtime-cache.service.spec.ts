import { MessageRole, StreamStatus } from './entities/message.entity';
import { ConversationRuntimeCacheService } from './conversation-runtime-cache.service';

describe('ConversationRuntimeCacheService', () => {
  const message = {
    id: 1,
    conversationId: 3,
    role: MessageRole.USER,
    requestId: 'request-1',
    streamStatus: StreamStatus.COMPLETED,
    content: 'hello',
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
  };

  it('hydrates from Redis and restores Date values', async () => {
    const redisService = {
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          messages: [message],
          hydratedAt: '2026-07-14T00:00:00.000Z',
          lastAccessedAt: '2026-07-14T00:00:00.000Z',
        }),
      ),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
    };
    const service = new ConversationRuntimeCacheService(redisService as any);

    const result = await service.get(3);

    expect(result?.messages[0].createdAt).toBeInstanceOf(Date);
    expect(redisService.set).not.toHaveBeenCalled();
  });

  it('loads from MySQL and writes the result on cache miss', async () => {
    const redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
    };
    const service = new ConversationRuntimeCacheService(redisService as any);
    const loader = jest.fn().mockResolvedValue([message]);

    const result = await service.getOrHydrate(3, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.messages).toHaveLength(1);
    expect(redisService.set).toHaveBeenCalledTimes(1);
  });
});
