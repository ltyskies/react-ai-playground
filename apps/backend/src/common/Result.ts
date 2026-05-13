/**
 * @file Result.ts
 * @description 统一响应结果类，用于标准化 API 返回格式
 * @module 公共模块 - 工具类
 */

/**
 * 通用响应结果类
 * @description 封装 API 响应的标准格式，包含状态码和数据
 * @template T - 响应数据的类型
 */
export class Result<T> {
  /** 响应状态码，200 表示成功，500 表示错误 */
  code: number;
  /** 响应数据，可选 */
  data?: T | null;

  /**
   * 构造函数
   * @param code - 响应状态码
   * @param data - 响应数据，可选
   */
  constructor(code: number, data?: T | null) {
    this.code = code;
    this.data = data;
  }

  /**
   * 返回成功的响应结果（无数据）
   * @description 用于不需要返回数据的操作，如删除成功
   * @template T - 响应数据类型
   * @returns Result 实例，code 为 200，data 为 undefined
   */
  static success<T>(): Result<T> {
    return new Result<T>(200);
  }

  /**
   * 返回成功的响应结果（带数据）
   * @description 用于需要返回数据的操作，如查询成功
   * @template T - 响应数据类型
   * @param data - 响应数据
   * @returns Result 实例，code 为 200，包含数据
   */
  static successWithData<T>(data: T): Result<T> {
    return new Result<T>(200, data);
  }

  /**
   * 返回错误的响应结果
   * @description 用于操作失败时返回错误信息
   * @template T - 错误消息类型
   * @param msg - 错误消息
   * @returns Result 实例，code 为 500，包含错误消息
   */
  static error<T>(msg: T): Result<T> {
    return new Result<T>(500, msg);
  }
}
