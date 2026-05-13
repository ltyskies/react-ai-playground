/**
 * @file app.service.ts
 * @description 应用程序根服务，提供基础业务逻辑
 * @module 根服务
 */

import { Injectable } from '@nestjs/common';

/**
 * 应用程序根服务
 * @description 提供应用级别的通用服务方法
 * @decorator @Injectable() - 标记为可注入服务，可被其他组件使用
 */
@Injectable()
export class AppService {
  /**
   * 获取欢迎信息
   * @description 返回应用的默认欢迎消息
   * @returns 欢迎字符串 "Hello World!"
   */
  getHello(): string {
    return 'Hello World!';
  }
}
