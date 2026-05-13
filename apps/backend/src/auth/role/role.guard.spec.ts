/**
 * @file role.guard.spec.ts
 * @description RoleGuard 的单元测试
 * @module 测试模块 - 认证模块
 */

import { RoleGuard } from './role.guard';

/**
 * RoleGuard 测试套件
 * @description 测试 RoleGuard 的基本功能
 */
describe('RoleGuard', () => {
  /**
   * 守卫实例化测试
   * @description 验证 RoleGuard 是否成功实例化
   */
  it('should be defined', () => {
    expect(new RoleGuard()).toBeDefined();
  });
});
