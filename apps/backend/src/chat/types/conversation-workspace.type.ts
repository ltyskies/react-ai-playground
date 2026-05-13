/**
 * @file conversation-workspace.type.ts
 * @description 会话工作区类型定义，描述聊天上下文中的文件编辑区结构
 * @module 聊天模块 - 类型定义
 */

/**
 * 工作区文件
 * @description 描述单个编辑中文件的名称、内容和语言类型
 */
export interface WorkspaceFile {
  /** 文件名，作为工作区中的唯一标识 */
  name: string;
  /** 文件内容 */
  value: string;
  /** 语言类型，用于前端编辑器高亮和模型提示 */
  language: string;
}

/**
 * 工作区文件集合
 * @description 以文件名为键保存当前会话中可编辑的文件对象
 */
export interface WorkspaceFiles {
  /** 文件名到文件内容对象的映射 */
  [key: string]: WorkspaceFile;
}

/**
 * 会话工作区
 * @description 保存当前对话关联的全部代码上下文和编辑器选中状态
 */
export interface ConversationWorkspace {
  /** 当前工作区文件字典 */
  files: WorkspaceFiles;
  /** 当前编辑器选中的文件名 */
  selectedFileName: string;
  /** 需要额外作为上下文发送给模型的文件名列表 */
  contextFiles: string[];
}
