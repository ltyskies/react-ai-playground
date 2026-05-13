/**
 * @file main.ts
 * @description 应用启动入口，负责初始化 Nest 应用、Swagger 文档和全局基础能力
 * @module 启动模块
 */

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpFilter } from './common/filter';

/**
 * 启动应用
 * @description 创建 Nest 应用实例并完成接口文档、全局异常过滤器和跨域配置
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 配置 Swagger 文档，方便本地调试和接口联调。
  const options = new DocumentBuilder()
    .addBearerAuth()
    .setTitle('\u63a5\u53e3\u6587\u6863')
    .setDescription('\u540e\u7aef')
    .setVersion('1')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('/api', app, document);

  // 注册全局异常过滤器，并开放跨域访问给前端调用。
  app.useGlobalFilters(new HttpFilter());
  app.enableCors();

  // 默认监听 3000 端口。
  await app.listen(3000);
}

void bootstrap();
