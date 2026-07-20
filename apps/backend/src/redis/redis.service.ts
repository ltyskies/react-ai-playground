import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;
  private readonly ttlJitterSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.keyPrefix =
      this.configService.get<string>('redis.keyPrefix') ||
      'react-ai-playground';
    this.ttlSeconds =
      this.configService.get<number>('redis.conversationTtlSeconds') || 1800;
    this.ttlJitterSeconds =
      this.configService.get<number>('redis.conversationTtlJitterSeconds') ||
      300;

    this.client = new Redis({
      host: this.configService.get<string>('redis.host') || '127.0.0.1',
      port: this.configService.get<number>('redis.port') || 6379,
      password: this.configService.get<string>('redis.password') || undefined,
      db: this.configService.get<number>('redis.db') || 0,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      // 请求立即失败并降级，但后台继续尝试恢复 Redis 连接。
      retryStrategy: () => 1000,
    });

    this.client.on('error', (error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.connectIfNeeded();
      return await this.client.get(this.withPrefix(key));
    } catch (error) {
      this.logCommandFailure('get', key, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    try {
      await this.connectIfNeeded();
      const ttl = this.ttlSeconds + this.randomJitter();
      await this.client.set(this.withPrefix(key), value, 'EX', ttl);
      return true;
    } catch (error) {
      this.logCommandFailure('set', key, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.connectIfNeeded();
      await this.client.del(this.withPrefix(key));
      return true;
    } catch (error) {
      this.logCommandFailure('del', key, error);
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }

  private async connectIfNeeded() {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  private withPrefix(key: string) {
    return `${this.keyPrefix}:${key}`;
  }

  private randomJitter() {
    if (this.ttlJitterSeconds <= 0) {
      return 0;
    }
    return Math.floor(Math.random() * (this.ttlJitterSeconds + 1));
  }

  private logCommandFailure(command: string, key: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Redis ${command} failed for ${key}: ${message}`);
  }
}
