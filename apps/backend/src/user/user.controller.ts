/**
 * @file user.controller.ts
 * @description 用户控制器，处理用户相关的 HTTP 请求
 * @module 用户模块
 */

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { UserDto } from './dto/user.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    userId?: number;
  };
}

/**
 * 用户控制器
 * @description 处理用户注册、登录等接口请求
 * @decorator @Controller('user') - 定义路由前缀为 /user
 * @decorator @ApiTags('User') - Swagger 文档标签
 */
@Controller('user')
@ApiTags('User')
export class UserController {
  /**
   * 构造函数，注入 UserService
   * @param userService - 用户服务实例
   */
  constructor(private readonly userService: UserService) {}

  /**
   * 从请求中获取用户 ID
   * @description 从认证请求对象中提取当前登录用户的 ID
   * @param req - 认证请求对象
   * @returns 用户 ID，未登录时返回 undefined
   */
  private getUserId(req: AuthenticatedRequest) {
    return req.user?.userId;
  }

  /**
   * 用户登录
   * @description 验证用户邮箱和密码，返回登录结果和 JWT Token
   * @param loginUserDto - 登录数据传输对象，包含邮箱和密码
   * @returns 登录结果，成功时包含用户信息和 Token
   * @decorator @Post('login') - 处理 POST /user/login 请求
   */
  @Post('login')
  login(@Body() loginUserDto: UserDto) {
    return this.userService.login(loginUserDto);
  }

  /**
   * 用户注册
   * @description 创建新用户账号，邮箱需唯一
   * @param registerUserDto - 注册数据传输对象，包含邮箱和密码
   * @returns 注册结果
   * @decorator @Post('register') - 处理 POST /user/register 请求
   */
  @Post('register')
  register(@Body() registerUserDto: UserDto) {
    return this.userService.register(registerUserDto);
  }

  /**
   * 获取用户提示词规则
   * @description 获取当前登录用户的自定义提示词规则配置
   * @param req - 认证请求对象，包含用户信息
   * @returns 用户的提示词规则
   * @decorator @Get('rules') - 处理 GET /user/rules 请求
   * @decorator @UseGuards(JwtAuthGuard) - 需要 JWT 认证
   */
  @Get('rules')
  @UseGuards(JwtAuthGuard)
  getPromptRules(@Req() req: AuthenticatedRequest) {
    return this.userService.getPromptRules(this.getUserId(req));
  }

  /**
   * 更新用户提示词规则
   * @description 更新当前登录用户的自定义提示词规则
   * @param req - 认证请求对象，包含用户信息
   * @param body - 包含 rules 字段的请求体
   * @returns 更新后的提示词规则
   * @decorator @Post('rules/update') - 处理 POST /user/rules/update 请求
   * @decorator @UseGuards(JwtAuthGuard) - 需要 JWT 认证
   */
  @Post('rules/update')
  @UseGuards(JwtAuthGuard)
  updatePromptRules(
    @Req() req: AuthenticatedRequest,
    @Body() body: { rules: string },
  ) {
    return this.userService.updatePromptRules(this.getUserId(req), body?.rules);
  }

  /**
   * 清除用户提示词规则
   * @description 清除当前登录用户的自定义提示词规则
   * @param req - 认证请求对象，包含用户信息
   * @returns 操作结果
   * @decorator @Post('rules/clear') - 处理 POST /user/rules/clear 请求
   * @decorator @UseGuards(JwtAuthGuard) - 需要 JWT 认证
   */
  @Post('rules/clear')
  @UseGuards(JwtAuthGuard)
  clearPromptRules(@Req() req: AuthenticatedRequest) {
    return this.userService.clearPromptRules(this.getUserId(req));
  }
}
