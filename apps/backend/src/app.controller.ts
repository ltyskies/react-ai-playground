/**
 * @file app.controller.ts
 * @description 应用程序根控制器，提供基础路由
 * @module 根控制器
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

/**
 * 应用程序根控制器
 * @description 处理应用根路径的请求，受 JWT 认证保护
 * @decorator @Controller() - 定义控制器，处理根路径请求
 * @decorator @UseGuards(JwtAuthGuard) - 应用 JWT 认证守卫，需要登录才能访问
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class AppController {
  /**
   * 构造函数，注入 AppService
   * @param appService - 应用服务实例
   */
  constructor(private readonly appService: AppService) {}

  /**
   * 获取欢迎信息
   * @description 返回应用的欢迎消息
   * @returns 欢迎字符串
   * @decorator @Get() - 处理 GET 请求
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
