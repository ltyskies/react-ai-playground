/**
 * @file profile.module.ts
 * @description 用户画像模块，管理画像提取与合成的完整管线
 * @module 画像模块
 */

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModule } from '../chat/chat.module';
import { User } from '../user/entities/user.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { ProfileSynthesisService } from './profile-synthesis.service';
import { ProfileExtractionService } from './profile-extraction.service';

/**
 * 用户画像模块
 * @description 提供画像事实提取（Phase 1）与画像合成（Phase 2）能力。
 *              依赖 ChatModule 的 ConversationSummaryService / MessageService 获取对话数据。
 * @decorator @Module - 定义 NestJS 模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Conversation]),
    forwardRef(() => ChatModule),
  ],
  providers: [ProfileSynthesisService, ProfileExtractionService],
  exports: [ProfileSynthesisService, ProfileExtractionService],
})
export class ProfileModule {}
