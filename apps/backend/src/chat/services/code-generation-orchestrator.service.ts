/**
 * @file code-generation-orchestrator.service.ts
 * @description 代码生成编排器
 *
 * 职责：消费模型流 → 用哨兵解析器切分思考/文件 → 对每个文件做工程化校验与
 * 回炉修复 → 产出结构化事件（thinking/progress/file_start/code/file_end）。
 * 校验通过（或超出修复次数带警告）后才逐行下发代码，保证前端只接收可用代码。
 */

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HumanMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import type { ConversationWorkspace } from '../types/conversation-workspace.type';
import type {
  GenerationEvent,
  PersistedCodeChange,
} from '../types/generation-event.type';
import { buildFixInstruction } from '../prompts/code-generation.prompt';
import { SentinelCodeParser, type ParseToken } from './sentinel-code-parser';
import { CodeValidatorService } from './code-validator.service';

/** 单文件校验失败后最多回炉修复次数 */
const MAX_FIX_ATTEMPTS = 2;

/** 逐行下发代码时每行之间的间隔（毫秒），用于在前端呈现逐行写入的打字效果 */
const CODE_LINE_DELAY_MS = 40;

/** 可被 abort 提前结束的延时 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

interface RunParams {
  model: ChatOpenAI;
  messages: BaseMessage[];
  workspace: ConversationWorkspace;
  signal?: AbortSignal;
}

/** 编排最终结果，供上层持久化 */
export interface OrchestrationResult {
  thinking: string;
  codeChanges: PersistedCodeChange[];
}

@Injectable()
export class CodeGenerationOrchestratorService {
  constructor(private readonly codeValidator: CodeValidatorService) {}

  /**
   * 运行编排，产出事件流；生成器 return 值为最终结果（思考文本 + 代码变更）
   */
  async *run(params: RunParams): AsyncGenerator<GenerationEvent, OrchestrationResult> {
    const { model, messages, workspace, signal } = params;
    const parser = new SentinelCodeParser();
    const codeChanges: PersistedCodeChange[] = [];
    let thinking = '';

    const stream = await model.stream(messages, { signal });

    for await (const chunk of stream) {
      if (signal?.aborted) {
        return { thinking, codeChanges };
      }

      const text = extractChunkContent(chunk.content);
      if (!text) continue;

      for (const token of parser.push(text)) {
        yield* this.handleToken(token, {
          model,
          workspace,
          signal,
          codeChanges,
          onThinking: (piece) => {
            thinking += piece;
          },
        });
      }
    }

    for (const token of parser.flush()) {
      yield* this.handleToken(token, {
        model,
        workspace,
        signal,
        codeChanges,
        onThinking: (piece) => {
          thinking += piece;
        },
      });
    }

    return { thinking: thinking.trim(), codeChanges };
  }

  /** 处理单个解析 token：思考直接下发，文件走校验-修复-逐行下发 */
  private async *handleToken(
    token: ParseToken,
    ctx: {
      model: ChatOpenAI;
      workspace: ConversationWorkspace;
      signal?: AbortSignal;
      codeChanges: PersistedCodeChange[];
      onThinking: (piece: string) => void;
    },
  ): AsyncGenerator<GenerationEvent> {
    if (token.kind === 'thinking') {
      if (!token.text) return;
      ctx.onThinking(token.text);
      yield { type: 'thinking', content: token.text };
      return;
    }

    const { fileName } = token;
    const oldValue = ctx.workspace.files[fileName]?.value ?? '';
    const isNewFile = !ctx.workspace.files[fileName];
    const language = fileName2Language(fileName);

    // 校验 + 回炉修复（全程对前端静默，前端保持“思考中”样式）
    let code = token.content;
    let attempt = 0;
    let errors = await this.codeValidator.validate(fileName, code);

    while (errors.length > 0 && attempt < MAX_FIX_ATTEMPTS) {
      if (ctx.signal?.aborted) return;
      attempt += 1;
      code = await this.fixFile(ctx.model, fileName, code, errors, ctx.signal);
      errors = await this.codeValidator.validate(fileName, code);
    }

    // 超出修复次数仍未通过：判定本次 AI coding 失败，抛错交由上层转成可重试错误
    if (errors.length > 0) {
      throw new ServiceUnavailableException('AI coding 失败，请重试');
    }

    // 逐行下发（validate_then_stream：校验通过后才开始下发）
    yield {
      type: 'file_start',
      fileName,
      language,
      isNewFile,
      oldValue,
    };

    const lines = code.split('\n');
    for (let index = 0; index < lines.length; index++) {
      if (ctx.signal?.aborted) return;
      yield { type: 'code', fileName, index, line: lines[index] };
      // 行间加入小间隔，让前端逐行写入可见（validate_then_stream 下代码已整份就绪，需人为制造节奏）
      if (index < lines.length - 1) {
        await sleep(CODE_LINE_DELAY_MS, ctx.signal);
      }
    }

    yield {
      type: 'file_end',
      fileName,
      status: 'done',
      content: code,
    };

    ctx.codeChanges.push({
      fileName,
      language,
      oldValue,
      newValue: code,
      isNewFile,
      status: 'done',
    });
  }

  /** 单文件回炉修复：把错误与原代码回传模型，解析出修正后的文件内容 */
  private async fixFile(
    model: ChatOpenAI,
    fileName: string,
    code: string,
    errors: string[],
    signal?: AbortSignal,
  ): Promise<string> {
    const instruction = buildFixInstruction({
      fileName,
      code,
      errors: errors.join('\n'),
    });

    const response = await model.invoke([new HumanMessage(instruction)], {
      signal,
    });
    const text = extractChunkContent(response.content);

    // 用解析器从修复回复中取出该文件，取不到则退回原代码
    const parser = new SentinelCodeParser();
    const tokens = [...parser.push(text), ...parser.flush()];
    const fileToken = tokens.find(
      (item): item is Extract<ParseToken, { kind: 'file' }> =>
        item.kind === 'file',
    );
    return fileToken?.content ?? code;
  }
}

/** 提取模型分片文本 */
function extractChunkContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (
        part &&
        typeof part === 'object' &&
        'text' in part &&
        typeof (part as { text: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
}

/** 按扩展名推断语言（与前端 fileName2Language 保持一致） */
function fileName2Language(name: string): string {
  const suffix = name.split('.').pop()?.toLowerCase() || '';
  if (['js', 'jsx'].includes(suffix)) return 'javascript';
  if (['ts', 'tsx'].includes(suffix)) return 'typescript';
  if (suffix === 'json') return 'json';
  if (suffix === 'css') return 'css';
  return 'javascript';
}
