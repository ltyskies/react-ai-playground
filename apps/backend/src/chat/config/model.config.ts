/**
 * @file model.config.ts
 * @description AI 模型工厂函数，封装 ChatOpenAI 实例化逻辑
 */

import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

/**
 * 创建主对话模型
 * @description 用于生成流式聊天回复
 * @param configService - NestJS 配置服务
 * @returns 已配置的 ChatOpenAI 实例
 */
export function createChatModel(configService: ConfigService) {
  const apiKey = configService.get<string>('ai.deepseek.apiKey');
  const baseURL = configService.get<string>('ai.deepseek.baseUrl');
  const modelName = configService.get<string>('ai.deepseek.model');

  return new ChatOpenAI({
    configuration: {
      baseURL,
    },
    apiKey,
    modelName,
    streaming: true,
    temperature: 0.7,
  });
}

/**
 * 创建摘要模型
 * @description 用于压缩长对话记忆，非流式调用
 * @param configService - NestJS 配置服务
 * @returns 已配置的 ChatOpenAI 实例
 */
export function createSummaryModel(configService: ConfigService) {
  const apiKey = configService.get<string>('ai.deepseek.apiKey');
  const baseURL = configService.get<string>('ai.deepseek.baseUrl');
  const modelName = configService.get<string>('ai.deepseek.model');

  return new ChatOpenAI({
    configuration: {
      baseURL,
    },
    apiKey,
    modelName,
    streaming: false,
    temperature: 0.2,
  });
}
