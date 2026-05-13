/**
 * @file jwt-auth.guard.ts
 * @description JWT 认证守卫，保护需要登录才能访问的路由
 * @module 认证模块 - 守卫
 */

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT 认证守卫
 * @description 继承自 Passport 的 AuthGuard，使用 jwt 策略验证请求
 *              当守卫应用于路由时，会自动验证请求头中的 JWT Token
 * @decorator @Injectable() - 标记为可注入服务
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
