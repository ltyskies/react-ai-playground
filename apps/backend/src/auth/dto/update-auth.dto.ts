/**
 * @file update-auth.dto.ts
 * @description 更新认证数据传输对象（预留）
 * @module 认证模块 - DTO
 */

import { PartialType } from '@nestjs/swagger';
import { CreateAuthDto } from './create-auth.dto';

/**
 * 更新认证 DTO
 * @description 继承自 CreateAuthDto 的部分类型，所有字段变为可选
 *              用于更新认证信息的请求
 * @extends PartialType(CreateAuthDto) - 使所有字段可选
 */
export class UpdateAuthDto extends PartialType(CreateAuthDto) {}
