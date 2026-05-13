/**
 * @file user.entity.ts
 * @description 用户实体定义，映射数据库 users 表
 * @module 用户模块 - 实体
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * 用户实体
 * @description 定义用户数据结构和数据库表映射关系
 * @decorator @Entity('users') - 映射到数据库 users 表
 */
@Entity('users')
export class User {
  /**
   * 用户唯一标识
   * @description 自增主键，唯一标识每个用户
   * @decorator @PrimaryGeneratedColumn() - 主键自增列
   */
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * 用户邮箱
   * @description 用户登录账号，必须唯一
   * @decorator @Column({ unique: true }) - 唯一约束列
   */
  @Column({ unique: true })
  email: string;

  /**
   * 用户密码
   * @description 加密后的密码，使用 bcrypt 加密存储
   * @decorator @Column() - 普通数据库列
   */
  @Column()
  password: string;

  /**
   * 用户提示词规则
   * @description 用户自定义的 AI 提示词规则，用于个性化 AI 回复
   * @decorator @Column({ name: 'prompt_rules', type: 'text', nullable: true }) - 可为空的长文本列
   */
  @Column({ name: 'prompt_rules', type: 'text', nullable: true })
  promptRules: string | null;

  /**
   * 创建时间
   * @description 用户账号创建时间，自动记录
   * @decorator @CreateDateColumn({ name: 'created_at' }) - 自动记录创建时间
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
