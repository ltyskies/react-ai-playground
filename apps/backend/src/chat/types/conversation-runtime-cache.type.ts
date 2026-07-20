import { MessageRole, StreamStatus } from '../entities/message.entity';

export interface ConversationRuntimeMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  requestId: string | null;
  streamStatus: StreamStatus;
  content: string;
  createdAt: Date;
}

export interface ConversationRuntimeState {
  messages: ConversationRuntimeMessage[];
  hydratedAt: Date;
  lastAccessedAt: Date;
}
