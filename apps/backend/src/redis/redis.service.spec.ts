import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('degrades to safe results when Redis is unavailable', async () => {
    const configService = new ConfigService({
      redis: {
        host: '127.0.0.1',
        port: 6399,
        db: 0,
        keyPrefix: 'test',
        conversationTtlSeconds: 10,
        conversationTtlJitterSeconds: 0,
      },
    });
    const service = new RedisService(configService);

    await expect(service.get('key')).resolves.toBeNull();
    await expect(service.set('key', 'value')).resolves.toBe(false);
    await expect(service.del('key')).resolves.toBe(false);
    await service.onModuleDestroy();
  });
});
