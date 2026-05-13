/**
 * @file user.service.ts
 * @description 用户服务，处理用户注册、登录等业务逻辑
 * @module 用户模块
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Result } from 'src/common/Result';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * 用户服务
 * @description 提供用户注册、登录、Token 生成等核心业务逻辑
 * @decorator @Injectable() - 标记为可注入服务
 */
@Injectable()
export class UserService {
  /**
   * 构造函数，注入依赖
   * @param user - 用户实体仓库，用于数据库操作
   * @param jwt - JWT 服务，用于生成 Token
   * @param configService - 配置服务，用于读取 JWT 密钥
   */
  constructor(
    @InjectRepository(User) private readonly user: Repository<User>,
    private jwt: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * 生成 JWT Token
   * @description 根据用户 ID 生成 JWT 访问令牌
   * @param id - 用户唯一标识
   * @returns JWT Token 字符串
   */
  token(id: number): string {
    return this.jwt.sign(
      { id }, // Token 载荷，包含用户 ID
      { secret: this.configService.get('jwt.secret') }, // 使用配置的密钥签名
    );
  }

  /**
   * 用户注册
   * @description 创建新用户，邮箱必须唯一，密码使用 bcrypt 加密存储
   * @param registerUserDto - 注册信息，包含邮箱和密码
   * @returns 注册结果，成功返回用户信息，失败返回错误信息
   */
  async register(registerUserDto: UserDto) {
    // 检查邮箱是否已被注册
    const existingUser = await this.user.findOne({
      where: { email: registerUserDto.email },
    });
    if (existingUser) {
      return Result.error('该邮箱已被注册');
    }

    // 创建新用户实体
    const user = new User();
    user.email = registerUserDto.email;

    // 使用 bcrypt 加密密码，salt 轮数为 10
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(registerUserDto.password, salt);

    // 保存用户到数据库
    await this.user.save(user);
    return Result.successWithData('注册成功');
  }

  /**
   * 用户登录
   * @description 验证用户邮箱和密码，成功后返回用户信息和 JWT Token
   * @param loginUserDto - 登录信息，包含邮箱和密码
   * @returns 登录结果，成功返回用户数据（不含密码）和 Token
   */
  async login(loginUserDto: UserDto) {
    const { email, password } = loginUserDto;

    // 根据邮箱查找用户
    const user = await this.user.findOne({ where: { email } });

    // 用户不存在
    if (!user) {
      return Result.error('用户不存在');
    }

    // 验证密码是否匹配
    const isMatch = await bcrypt.compare(password, user.password);

    // 密码错误
    if (!isMatch) {
      return Result.error('密码错误');
    }

    // 解构用户对象，排除 password 字段
    const { password: _, promptRules: __, ...result } = user;

    // 返回用户信息和 Token
    return Result.successWithData({
      ...result,
      token: this.token(user.id),
    });
  }

  /**
   * 获取用户提示词规则
   * @description 获取指定用户的自定义提示词规则配置
   * @param userId - 用户 ID
   * @returns 包含提示词规则的结果对象
   */
  async getPromptRules(userId?: number) {
    const user = await this.getAuthenticatedUser(userId);

    return Result.successWithData({
      rules: user.promptRules || '',
    });
  }

  /**
   * 更新用户提示词规则
   * @description 更新指定用户的自定义提示词规则，空字符串会被清除
   * @param userId - 用户 ID
   * @param rules - 新的提示词规则
   * @returns 更新后的提示词规则
   */
  async updatePromptRules(userId: number | undefined, rules: string) {
    if (typeof rules !== 'string') {
      throw new BadRequestException('Missing rules');
    }

    const user = await this.getAuthenticatedUser(userId);
    const normalizedRules = rules.trim();

    user.promptRules = normalizedRules ? rules : null;
    await this.user.save(user);

    return Result.successWithData({
      rules: user.promptRules || '',
    });
  }

  /**
   * 清除用户提示词规则
   * @description 清除指定用户的自定义提示词规则
   * @param userId - 用户 ID
   * @returns 操作结果，规则字段为空字符串
   */
  async clearPromptRules(userId?: number) {
    const user = await this.getAuthenticatedUser(userId);
    user.promptRules = null;
    await this.user.save(user);

    return Result.successWithData({
      rules: '',
    });
  }

  /**
   * 获取已认证用户
   * @description 根据用户 ID 获取用户实体，并进行权限校验
   * @param userId - 用户 ID
   * @returns 用户实体
   * @throws ForbiddenException - 用户未登录时抛出
   * @throws NotFoundException - 用户不存在时抛出
   */
  private async getAuthenticatedUser(userId?: number) {
    if (!userId) {
      throw new ForbiddenException('Forbidden');
    }

    const user = await this.user.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
