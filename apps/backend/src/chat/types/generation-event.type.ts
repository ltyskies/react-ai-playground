/**
 * @file generation-event.type.ts
 * @description 代码生成编排产出的结构化事件类型定义
 * @module 聊天模块 - 类型定义
 *
 * 后端不再向前端下发「模型原文」，也不暴露校验/回炉等中间阶段，而是把一次回复拆成：
 * - thinking：给用户看的思考/说明文本（增量）
 * - file_start / code / file_end：经过工程化校验后的代码，逐行下发
 * 校验回炉全程对前端静默，前端保持「思考中」；若最终仍失败，则由控制器层下发 error 事件。
 */

/** 代码文件最终状态：仅在校验通过后下发，恒为 done */
export type GenerationFileStatus = 'done';

/** 思考/说明文本增量 */
export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

/** 某个文件开始下发（前端据此跳转代码区、擦除/新建文件） */
export interface FileStartEvent {
  type: 'file_start';
  fileName: string;
  language: string;
  isNewFile: boolean;
  /** 本轮对话之前该文件的内容，供前端撤销与 diff 使用 */
  oldValue: string;
}

/** 文件的一行代码（逐行下发，前端追加） */
export interface CodeLineEvent {
  type: 'code';
  fileName: string;
  index: number;
  line: string;
}

/** 某个文件下发完成，附带校验后的完整内容（前端据此做权威覆盖） */
export interface FileEndEvent {
  type: 'file_end';
  fileName: string;
  status: GenerationFileStatus;
  content: string;
}

/** 编排产出的事件联合类型（error 与 [DONE] 由控制器层单独处理） */
export type GenerationEvent =
  | ThinkingEvent
  | FileStartEvent
  | CodeLineEvent
  | FileEndEvent;

/**
 * 持久化用的代码变更结构
 * @description 保存到 assistant 消息上，供历史回放时重建 file 事件
 */
export interface PersistedCodeChange {
  fileName: string;
  language: string;
  oldValue: string;
  newValue: string;
  isNewFile: boolean;
  status: GenerationFileStatus;
}
