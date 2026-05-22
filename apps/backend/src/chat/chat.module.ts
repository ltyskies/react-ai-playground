/**
 * @file chat.module.ts
 * @description 聊天模块，提供 AI 对话与会话管理能力
 * @module 聊天模块
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ConversationRuntimeMemoryService } from './conversation-runtime-memory.service';
import { ProfileSynthesisService } from './profile-synthesis';
import { ConversationService } from './services/conversation.service';
import { MessageService } from './services/message.service';
import { ConversationSummaryService } from './services/conversation-summary.service';
import { ProfileExtractionService } from './services/profile-extraction.service';
import { StreamGenerationService } from './services/stream-generation.service';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { User } from '../user/entities/user.entity';

/**
 * 聊天模块
 * @description 整合聊天相关控制器、服务和实体，管理 AI 对话链路
 * @decorator @Module - 定义 NestJS 模块
 */
@Module({
  imports: [
    // 导入会话、消息和用户实体，供聊天服务查询与持久化使用。
    TypeOrmModule.forFeature([Conversation, Message, User]),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ConversationRuntimeMemoryService,
    ProfileSynthesisService,
    ConversationService,
    MessageService,
    ConversationSummaryService,
    ProfileExtractionService,
    StreamGenerationService,
  ],
})
export class ChatModule {}
