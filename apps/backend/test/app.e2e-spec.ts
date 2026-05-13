/**
 * @file app.e2e-spec.ts
 * @description 应用程序端到端测试
 * @module E2E 测试模块
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * AppController E2E 测试套件
 * @description 测试应用程序的端到端功能
 */
describe('AppController (e2e)', () => {
  /** NestJS 应用实例 */
  let app: INestApplication<App>;

  /**
   * 每个测试用例执行前的初始化
   * @description 创建应用实例并初始化
   */
  beforeEach(async () => {
    // 创建测试模块，导入根模块
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // 创建 NestJS 应用实例
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  /**
   * 根路由 E2E 测试
   * @description 测试 GET / 路由返回欢迎信息
   */
  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200) // 期望状态码 200
      .expect('Hello World!'); // 期望返回内容
  });
});
