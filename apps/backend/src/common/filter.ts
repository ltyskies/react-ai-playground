/**
 * @file filter.ts
 * @description 全局 HTTP 异常过滤器，统一处理应用中的 HTTP 异常
 * @module 公共模块 - 过滤器
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Result } from './Result';

/**
 * HTTP 异常过滤器
 * @description 捕获所有 HTTP 异常，统一格式化错误响应
 * @decorator @Catch(HttpException) - 捕获 HttpException 类型的异常
 */
@Catch(HttpException)
export class HttpFilter implements ExceptionFilter {
  /**
   * 捕获并处理异常
   * @description 当发生 HTTP 异常时，将异常信息转换为统一的响应格式
   * @param exception - 捕获到的 HTTP 异常对象
   * @param host - 参数宿主对象，用于获取请求和响应对象
   */
  catch(exception: HttpException, host: ArgumentsHost) {
    // 切换到 HTTP 上下文
    const ctx = host.switchToHttp();
    // 获取请求对象
    const request = ctx.getRequest<Request>();
    // 获取响应对象
    const response = ctx.getResponse<Response>();

    // 获取异常状态码
    const status = exception.getStatus();

    // 获取异常响应信息
    const exceptionResponse = exception.getResponse();

    // 在控制台输出异常信息，便于调试
    console.log('异常过滤器捕获到异常:', exceptionResponse);

    // 返回统一的错误响应格式
    response
      .status(status)
      .json(
        Result.error(
          (exceptionResponse as any).message || exception.message || '未知错误',
        ),
      );
  }
}
