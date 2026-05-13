/**
 * @file app.controller.spec.ts
 * @description AppController 的单元测试
 * @module 测试模块
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * AppController 测试套件
 * @description 测试 AppController 的基本功能
 */
describe('AppController', () => {
  /** AppController 实例 */
  let appController: AppController;

  /**
   * 每个测试用例执行前的初始化
   * @description 创建测试模块并编译
   */
  beforeEach(async () => {
    // 创建测试模块，导入控制器和提供者
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    // 获取控制器实例
    appController = app.get<AppController>(AppController);
  });

  /**
   * 根路由测试
   * @description 测试 GET / 路由返回欢迎信息
   */
  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
