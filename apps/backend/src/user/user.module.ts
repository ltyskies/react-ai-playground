/**
 * @file user.module.ts
 * @description 用户模块，提供用户注册、登录等功能
 * @module 用户模块
 */

import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 用户模块
 * @description 整合用户相关的控制器、服务和实体，配置 JWT 认证
 * @decorator @Module - 定义 NestJS 模块
 */
@Module({
  imports: [
    // 导入 TypeORM 实体，用于数据库操作
    TypeOrmModule.forFeature([User]),
    // 异步配置 JWT 模块
    JwtModule.registerAsync({
      imports: [ConfigModule], // 导入配置模块
      inject: [ConfigService], // 注入配置服务
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'), // 从配置获取 JWT 密钥
        signOptions: { expiresIn: '120h' }, // Token 有效期 120 小时
      }),
    }),
  ],
  controllers: [UserController], // 注册用户控制器
  providers: [UserService, JwtService], // 注册用户服务和 JWT 服务
  exports: [TypeOrmModule], // 导出 TypeORM 模块，供其他模块使用
})
export class UserModule {}
