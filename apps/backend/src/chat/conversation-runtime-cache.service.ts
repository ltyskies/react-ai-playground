import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type {
  ConversationRuntimeMessage,
  ConversationRuntimeState,
} from './types/conversation-runtime-cache.type';

@Injectable()
export class ConversationRuntimeCacheService {
  private readonly keyPrefix = 'chat:conversation';
  private readonly locks = new Map<number, Promise<void>>();

  constructor(private readonly redisService: RedisService) {}

  async hydrate(
    conversationId: number,
    messages: ConversationRuntimeMessage[],
  ): Promise<ConversationRuntimeState> {
    return this.withConversationLock(conversationId, () =>
      this.hydrateUnlocked(conversationId, messages),
    );
  }

  async get(conversationId: number): Promise<ConversationRuntimeState | null> {
    const serialized = await this.redisService.get(
      this.cacheKey(conversationId),
    );
    if (!serialized) {
      return null;
    }

    try {
      const state = this.parseState(serialized);
      state.lastAccessedAt = new Date();
      return this.cloneState(state);
    } catch {
      await this.redisService.del(this.cacheKey(conversationId));
      return null;
    }
  }

  async getOrHydrate(
    conversationId: number,
    loader: () => Promise<ConversationRuntimeMessage[]>,
  ): Promise<ConversationRuntimeState> {
    const existingState = await this.get(conversationId);
    if (existingState) {
      return existingState;
    }

    return this.withConversationLock(conversationId, async () => {
      const retryState = await this.get(conversationId);
      if (retryState) {
        return retryState;
      }

      const messages = await loader();
      return this.hydrateUnlocked(conversationId, messages);
    });
  }

  async invalidate(conversationId: number): Promise<void> {
    await this.withConversationLock(conversationId, async () => {
      await this.redisService.del(this.cacheKey(conversationId));
    });
  }

  private async withConversationLock<T>(
    conversationId: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(conversationId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.locks.set(conversationId, chain);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(conversationId) === chain) {
        this.locks.delete(conversationId);
      }
    }
  }

  private async hydrateUnlocked(
    conversationId: number,
    messages: ConversationRuntimeMessage[],
  ): Promise<ConversationRuntimeState> {
    const now = new Date();
    const state: ConversationRuntimeState = {
      messages: this.sortMessages(
        messages.map((message) => this.cloneMessage(message)),
      ),
      hydratedAt: now,
      lastAccessedAt: now,
    };

    await this.write(conversationId, state);
    return this.cloneState(state);
  }

  private async write(conversationId: number, state: ConversationRuntimeState) {
    await this.redisService.set(
      this.cacheKey(conversationId),
      JSON.stringify(state),
    );
  }

  private cacheKey(conversationId: number) {
    return `${this.keyPrefix}:${conversationId}:runtime:v1`;
  }

  private parseState(serialized: string): ConversationRuntimeState {
    const parsed = JSON.parse(serialized) as ConversationRuntimeState;
    if (
      !parsed ||
      !Array.isArray(parsed.messages) ||
      !parsed.hydratedAt ||
      !parsed.lastAccessedAt
    ) {
      throw new Error('Invalid conversation runtime cache');
    }

    return {
      messages: parsed.messages.map((message) => ({
        ...message,
        createdAt: new Date(message.createdAt),
      })),
      hydratedAt: new Date(parsed.hydratedAt),
      lastAccessedAt: new Date(parsed.lastAccessedAt),
    };
  }

  private cloneState(
    state: ConversationRuntimeState,
  ): ConversationRuntimeState {
    return {
      messages: state.messages.map((message) => this.cloneMessage(message)),
      hydratedAt: new Date(state.hydratedAt),
      lastAccessedAt: new Date(state.lastAccessedAt),
    };
  }

  private cloneMessage(
    message: ConversationRuntimeMessage,
  ): ConversationRuntimeMessage {
    return {
      ...message,
      createdAt: new Date(message.createdAt),
    };
  }

  private sortMessages(messages: ConversationRuntimeMessage[]) {
    return messages.slice().sort((a, b) => {
      const timeDiff = a.createdAt.getTime() - b.createdAt.getTime();
      return timeDiff !== 0 ? timeDiff : a.id - b.id;
    });
  }
}
