/**
 * @file chat.controller.ts
 * @description 聊天控制器，处理 AI 对话相关 HTTP 请求
 * @module 聊天模块
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import type { ConversationWorkspace } from './types/conversation-workspace.type';

/**
 * 认证请求接口
 * @description 扩展 Express 请求对象，包含认证用户信息和事件监听方法
 */
interface AuthenticatedRequest {
  /** 认证用户信息 */
  user?: {
    /** 用户 ID */
    userId?: number;
  };
  /** 事件监听方法，用于监听连接关闭等事件 */
  on: (event: string, listener: () => void) => void;
}

/**
 * 聊天控制器
 * @description 处理会话管理、工作区保存和 AI 流式对话等 HTTP 请求
 * @decorator @Controller('chat') - 定义路由前缀为 /chat
 * @decorator @UseGuards(JwtAuthGuard) - 所有路由需要 JWT 认证
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  /**
   * 构造函数，注入 ChatService
   * @param chatService - 聊天服务实例
   */
  constructor(private readonly chatService: ChatService) {}

  /**
   * 从请求中获取用户 ID
   * @description 从认证请求对象中提取当前登录用户的 ID
   * @param req - 认证请求对象
   * @returns 用户 ID，未登录时返回 undefined
   */
  private getUserId(req: AuthenticatedRequest) {
    return req.user?.userId;
  }

  /**
   * 获取 HTTP 异常消息
   * @description 从 HTTP 异常对象中提取可读的错误消息
   * @param error - HTTP 异常对象
   * @param fallback - 默认错误消息
   * @returns 提取的错误消息或默认消息
   */
  private getHttpExceptionMessage(error: HttpException, fallback: string) {
    const response = error.getResponse();

    if (typeof response === 'string' && response.trim()) {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const { message } = response as { message?: string | string[] };

      if (typeof message === 'string' && message.trim()) {
        return message;
      }

      if (Array.isArray(message)) {
        const normalizedMessage = message
          .filter((item) => typeof item === 'string' && item.trim())
          .join(', ');

        if (normalizedMessage) {
          return normalizedMessage;
        }
      }
    }

    return fallback;
  }

  /**
   * 构建流式错误响应载荷
   * @description 根据错误类型构建标准化的 SSE 错误响应数据
   * @param error - 捕获的错误对象
   * @returns 包含错误消息、是否可重试和错误原因的对象
   */
  private buildStreamErrorPayload(error: unknown) {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const reason =
        status === 400
          ? 'bad_request'
          : status === 401
            ? 'unauthorized'
            : status === 403
              ? 'forbidden'
              : status === 404
                ? 'not_found'
                : 'http_error';

      return {
        message: this.getHttpExceptionMessage(error, 'Request failed'),
        retryable: status === 408 || status === 429 || status >= 500,
        reason,
      };
    }

    return {
      message: 'Internal Server Error',
      retryable: true,
      reason: 'internal_error',
    };
  }

  /**
   * 创建新会话
   * @description 为当前用户创建一个新的聊天会话
   * @param req - 认证请求对象
   * @returns 创建成功的会话 ID
   * @decorator @Post('conversation') - 处理 POST /chat/conversation 请求
   */
  @Post('conversation')
  async createConversation(@Req() req: AuthenticatedRequest) {
    return this.chatService.createConversation(this.getUserId(req));
  }

  /**
   * 获取会话列表
   * @description 获取当前用户的所有聊天会话列表
   * @param req - 认证请求对象
   * @returns 会话列表
   * @decorator @Get('conversations') - 处理 GET /chat/conversations 请求
   */
  @Get('conversations')
  async getConversationList(@Req() req: AuthenticatedRequest) {
    return this.chatService.getConversationList(this.getUserId(req));
  }

  /**
   * 获取会话详情
   * @description 获取指定会话的详细信息和消息列表
   * @param req - 认证请求对象
   * @param id - 会话 ID 字符串
   * @returns 会话详情
   * @decorator @Get('conversation') - 处理 GET /chat/conversation 请求
   */
  @Get('conversation')
  async getConversationDetail(
    @Req() req: AuthenticatedRequest,
    @Query('id') id: string,
  ) {
    const conversationId = Number(id);

    if (!conversationId) {
      throw new BadRequestException('Missing conversation id');
    }

    return this.chatService.getConversationDetail(
      this.getUserId(req),
      conversationId,
    );
  }

  /**
   * 删除会话
   * @description 删除指定会话（仅删除会话记录，不删除关联的消息）
   * @param req - 认证请求对象
   * @param body - 包含会话 ID 的请求体
   * @returns 删除结果
   * @decorator @Post('conversation/delete') - 处理 POST /chat/conversation/delete 请求
   */
  @Post('conversation/delete')
  async deleteConversation(
    @Req() req: AuthenticatedRequest,
    @Body() body: { conversationId: number },
  ) {
    const { conversationId } = body;

    if (!conversationId) {
      throw new BadRequestException('Missing conversation id');
    }

    return this.chatService.deleteConversation(
      this.getUserId(req),
      conversationId,
    );
  }

  /**
   * 保存会话工作区
   * @description 保存当前会话的代码编辑器状态和工作区快照
   * @param req - 认证请求对象
   * @param body - 包含会话 ID 和工作区数据的请求体
   * @returns 保存结果
   * @decorator @Post('conversation/workspace') - 处理 POST /chat/conversation/workspace 请求
   */
  @Post('conversation/workspace')
  async saveConversationWorkspace(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: { conversationId: number; workspace: ConversationWorkspace },
  ) {
    const { conversationId, workspace } = body;

    if (!conversationId || !workspace) {
      throw new BadRequestException('Missing conversationId or workspace');
    }

    return this.chatService.saveConversationWorkspace(
      this.getUserId(req),
      conversationId,
      workspace,
    );
  }

  /**
   * 流式消息生成
   * @description 接收用户消息，调用 AI 模型生成流式回复，通过 SSE 返回
   * @param req - 认证请求对象
   * @param body - 包含会话 ID、消息内容、工作区和请求 ID 的请求体
   * @param res - Express 响应对象，用于 SSE 输出
   * @decorator @Post('stream') - 处理 POST /chat/stream 请求
   */
  @Post('stream')
  async streamMessage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      conversationId: number;
      message: string;
      workspace: ConversationWorkspace;
      requestId: string;
    },
    @Res() res: Response,
  ) {
    const { conversationId, message, workspace, requestId } = body;

    if (!conversationId || !message || !workspace || !requestId) {
      throw new BadRequestException(
        'Missing conversationId, message, workspace or requestId',
      );
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    let isStreamFinished = false;

    req.on('close', () => {
      if (isStreamFinished) {
        return;
      }

      abortController.abort();
      console.log('Client connection closed, stop streaming');
    });

    try {
      const streamGenerator = await this.chatService.generateStream(
        this.getUserId(req),
        conversationId,
        message,
        workspace,
        requestId,
        { signal: abortController.signal },
      );

      for await (const chunk of streamGenerator) {
        if (abortController.signal.aborted || res.writableEnded) {
          break;
        }

        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      if (!abortController.signal.aborted && !res.writableEnded) {
        res.write('data: [DONE]\n\n');
      }

      isStreamFinished = true;
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      console.error('Streaming error:', error);
      isStreamFinished = true;

      if (!abortController.signal.aborted && !res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify(this.buildStreamErrorPayload(error))}\n\n`,
        );
        res.end();
      }
    }
  }
}
