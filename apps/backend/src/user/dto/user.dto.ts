/**
 * @file user.dto.ts
 * @description 用户数据传输对象，定义用户相关的请求数据结构
 * @module 用户模块 - DTO
 */

import { ApiProperty } from '@nestjs/swagger';

/**
 * 用户数据传输对象
 * @description 用于用户注册和登录请求的数据验证和传输
 */
export class UserDto {
  /**
   * 用户邮箱
   * @description 用户的唯一标识邮箱，用于登录和注册
   * @decorator @ApiProperty - Swagger 文档属性描述
   */
  @ApiProperty({ description: '邮箱' })
  email: string;

  /**
   * 用户密码
   * @description 用户登录密码，将在服务端加密存储
   * @decorator @ApiProperty - Swagger 文档属性描述
   */
  @ApiProperty({ description: '密码' })
  password: string;
}
