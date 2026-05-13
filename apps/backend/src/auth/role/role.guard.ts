/**
 * @file role.guard.ts
 * @description 角色权限守卫，用于控制基于角色的访问权限（预留实现）
 * @module 认证模块 - 守卫
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * 角色权限守卫
 * @description 用于验证用户是否有权限访问特定资源
 *              当前实现为预留，直接返回 true 允许所有访问
 * @decorator @Injectable() - 标记为可注入服务
 */
@Injectable()
export class RoleGuard implements CanActivate {
  /**
   * 判断是否允许访问
   * @description 验证当前请求是否有权限访问目标资源
   * @param context - 执行上下文，包含请求信息
   * @returns 是否允许访问，true 表示允许，false 表示拒绝
   */
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // 当前实现直接返回 true，允许所有访问
    // 后续可根据需求实现具体的角色验证逻辑
    void context;
    return true;
  }
}
