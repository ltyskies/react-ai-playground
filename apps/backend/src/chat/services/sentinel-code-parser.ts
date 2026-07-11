/**
 * @file sentinel-code-parser.ts
 * @description 哨兵协议增量解析器
 *
 * 在流式接收模型文本时，把内容切分为「思考文本」与「完整文件块」。
 * 采用 validate_then_stream 策略：文件内容整体缓冲，遇到结束哨兵才作为一个完整
 * 文件 token 产出，交由上层做工程化校验后再逐行下发。
 */

import {
  FILE_START_MARKER_PREFIX,
  FILE_START_MARKER_SUFFIX,
  FILE_END_MARKER,
} from '../prompts/code-generation.prompt';

/** 解析出的 token：思考文本片段或一个完整文件块 */
export type ParseToken =
  | { kind: 'thinking'; text: string }
  | { kind: 'file'; fileName: string; content: string };

/** 起始哨兵的固定前缀，用于判断缓冲区尾部是否可能正在形成一个哨兵 */
const START_PREFIX = FILE_START_MARKER_PREFIX;

/** 计算字符串尾部与目标前缀的最长「可能未完成」重叠长度 */
function trailingPartialLength(buffer: string, marker: string): number {
  const max = Math.min(buffer.length, marker.length - 1);
  for (let len = max; len > 0; len--) {
    if (buffer.endsWith(marker.slice(0, len))) {
      return len;
    }
  }
  return 0;
}

export class SentinelCodeParser {
  private buffer = '';
  private state: 'outside' | 'infile' = 'outside';
  private currentFileName = '';

  /** 追加一段模型文本，返回本次可确定产出的 token 列表 */
  push(chunk: string): ParseToken[] {
    this.buffer += chunk;
    const tokens: ParseToken[] = [];

    // 循环处理，直到缓冲区无法再产出确定的 token
    for (;;) {
      if (this.state === 'outside') {
        const startIndex = this.buffer.indexOf(START_PREFIX);

        if (startIndex === -1) {
          // 没有起始哨兵：产出思考文本，但保留可能正在形成哨兵的尾部
          const hold = trailingPartialLength(this.buffer, START_PREFIX);
          const emitEnd = this.buffer.length - hold;
          if (emitEnd > 0) {
            tokens.push({ kind: 'thinking', text: this.buffer.slice(0, emitEnd) });
            this.buffer = this.buffer.slice(emitEnd);
          }
          break;
        }

        // 找到起始前缀，尝试解析出完整的 <<<FILE path="...">>>
        const suffixIndex = this.buffer.indexOf(
          FILE_START_MARKER_SUFFIX,
          startIndex + START_PREFIX.length,
        );
        if (suffixIndex === -1) {
          // 起始哨兵还没接收完整：先产出它之前的思考文本，等待后续
          if (startIndex > 0) {
            tokens.push({ kind: 'thinking', text: this.buffer.slice(0, startIndex) });
            this.buffer = this.buffer.slice(startIndex);
          }
          break;
        }

        // 起始哨兵完整
        if (startIndex > 0) {
          tokens.push({ kind: 'thinking', text: this.buffer.slice(0, startIndex) });
        }
        this.currentFileName = this.buffer
          .slice(startIndex + START_PREFIX.length, suffixIndex)
          .trim();
        // 跳过起始哨兵及其后紧跟的一个换行
        let contentStart = suffixIndex + FILE_START_MARKER_SUFFIX.length;
        if (this.buffer[contentStart] === '\n') {
          contentStart += 1;
        } else if (
          this.buffer[contentStart] === '\r' &&
          this.buffer[contentStart + 1] === '\n'
        ) {
          contentStart += 2;
        }
        this.buffer = this.buffer.slice(contentStart);
        this.state = 'infile';
        continue;
      }

      // infile：等待结束哨兵
      const endIndex = this.buffer.indexOf(FILE_END_MARKER);
      if (endIndex === -1) {
        // 结束哨兵未出现：整体缓冲，不产出（validate_then_stream）
        break;
      }

      const content = stripTrailingNewline(this.buffer.slice(0, endIndex));
      tokens.push({
        kind: 'file',
        fileName: this.currentFileName,
        content,
      });
      this.buffer = this.buffer.slice(endIndex + FILE_END_MARKER.length);
      this.state = 'outside';
      this.currentFileName = '';
    }

    return tokens;
  }

  /** 流结束时冲刷缓冲区，尽力产出剩余内容 */
  flush(): ParseToken[] {
    const tokens: ParseToken[] = [];

    if (this.state === 'infile') {
      // 文件未正常闭合（可能被截断）：尽力把已收到的内容作为文件产出
      const content = stripTrailingNewline(this.buffer);
      if (content.trim()) {
        tokens.push({
          kind: 'file',
          fileName: this.currentFileName,
          content,
        });
      }
    } else if (this.buffer.trim()) {
      tokens.push({ kind: 'thinking', text: this.buffer });
    }

    this.buffer = '';
    this.state = 'outside';
    this.currentFileName = '';
    return tokens;
  }
}

/** 去掉内容末尾多余的一个换行，避免文件尾部凭空多出空行 */
function stripTrailingNewline(text: string): string {
  if (text.endsWith('\r\n')) {
    return text.slice(0, -2);
  }
  if (text.endsWith('\n')) {
    return text.slice(0, -1);
  }
  return text;
}
