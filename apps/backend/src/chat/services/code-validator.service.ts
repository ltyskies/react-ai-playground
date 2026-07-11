/**
 * @file code-validator.service.ts
 * @description 代码工程化校验服务
 *
 * 校验维度（聚焦「格式/语法工程化审查」，即当前前端提取错误的主要来源）：
 * - 扩展名白名单（ts/tsx/js/jsx/css/json）
 * - 占位符检测（省略号 / "rest of code" 等，模型偷懒的高发问题）
 * - 语法校验：ts/tsx/js/jsx/css 走 esbuild transform，json 走 JSON.parse
 *
 * 跨文件相对 import 解析涉及同轮后续文件的前向引用，误报率高，暂不纳入强校验。
 */

import { Injectable } from '@nestjs/common';
import { transform, type Loader } from 'esbuild';

/** 支持的文件扩展名到 esbuild loader 的映射 */
const LOADER_MAP: Record<string, Loader> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  css: 'css',
};

/** 明显的偷懒占位符模式 */
const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /\/\/\s*\.\.\./, hint: '出现 "// ..." 省略占位符' },
  { pattern: /\{\s*\/\*\s*\.\.\./, hint: '出现 "/* ... */" 省略占位符' },
  { pattern: /(rest of (the )?code)/i, hint: '出现 "rest of code" 占位符' },
  { pattern: /(unchanged|保持不变|省略)/i, hint: '出现 "unchanged/省略" 占位符' },
];

@Injectable()
export class CodeValidatorService {
  /**
   * 校验单个文件
   * @returns 错误描述数组，为空表示通过
   */
  async validate(fileName: string, code: string): Promise<string[]> {
    const errors: string[] = [];
    const ext = getExtension(fileName);

    if (!ext) {
      errors.push(`文件名 "${fileName}" 缺少扩展名`);
      return errors;
    }

    if (ext !== 'json' && !LOADER_MAP[ext]) {
      errors.push(
        `不支持的文件类型 ".${ext}"，仅支持 ts/tsx/js/jsx/css/json`,
      );
      return errors;
    }

    if (!code.trim()) {
      errors.push('文件内容为空');
      return errors;
    }

    for (const { pattern, hint } of PLACEHOLDER_PATTERNS) {
      if (pattern.test(code)) {
        errors.push(`${hint}，请输出完整代码`);
      }
    }

    if (ext === 'json') {
      try {
        JSON.parse(code);
      } catch (error) {
        errors.push(`JSON 解析失败：${(error as Error).message}`);
      }
      return errors;
    }

    // ts/tsx/js/jsx/css 语法校验
    try {
      await transform(code, {
        loader: LOADER_MAP[ext],
        // tsx/jsx 使用 automatic 运行时，避免因未显式 import React 而误报
        jsx: 'automatic',
      });
    } catch (error) {
      errors.push(...formatEsbuildErrors(error));
    }

    return errors;
  }
}

/** 提取文件扩展名（小写） */
function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** 把 esbuild 抛出的错误结构格式化为可读的错误行 */
function formatEsbuildErrors(error: unknown): string[] {
  const maybe = error as { errors?: Array<{ text: string; location?: { line: number; column: number } }> };
  if (maybe?.errors?.length) {
    return maybe.errors.map((item) => {
      const loc = item.location
        ? `(第 ${item.location.line} 行, 第 ${item.location.column} 列) `
        : '';
      return `语法错误 ${loc}${item.text}`;
    });
  }
  return [`语法错误：${(error as Error).message}`];
}
