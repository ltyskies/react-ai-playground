/**
 * @file auth.module.ts
 * @description 认证模块，提供 JWT 认证和 Passport 策略支持
 * @module 认证模块
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 认证模块
 * @description 配置 Passport 和 JWT，提供身份验证功能
 * @decorator @Module - 定义 NestJS 模块
 */
@Module({
  imports: [
    // 注册 Passport 并设置默认策略名为 jwt
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
  providers: [JwtStrategy], // 注册 JWT 策略
  exports: [PassportModule, JwtModule], // 导出模块供其他模块使用
})
export class AuthModule {}
