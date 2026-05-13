/**
 * @file jwt.strategy.ts
 * @description JWT 认证策略，验证请求中的 JWT Token
 * @module 认证模块
 */

import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface JwtPayload {
  id: number;
}

/**
 * JWT 认证策略
 * @description 实现 Passport JWT 策略，从请求头中提取并验证 JWT Token
 * @decorator @Injectable() - 标记为可注入服务
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * 构造函数，配置 JWT 策略
   * @param configService - 配置服务，用于读取 JWT 密钥
   */
  constructor(private configService: ConfigService) {
    super({
      // 从请求头的 Authorization 字段提取 Bearer Token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不忽略 Token 过期检查
      ignoreExpiration: false,
      // JWT 签名密钥，优先从环境变量读取
      secretOrKey: configService.get<string>('JWT_SECRET') || 'defaultSecret',
    });
  }

  /**
   * 验证 JWT 载荷
   * @description 验证 Token 中的用户信息，返回的用户对象会被注入到 request.user
   * @param payload - JWT Token 解码后的载荷
   * @returns 包含用户 ID 的对象，将被附加到请求对象
   */
  validate(payload: JwtPayload) {
    // 返回的对象会被注入到 request.user 中，供后续使用
    return { userId: payload.id };
  }
}
