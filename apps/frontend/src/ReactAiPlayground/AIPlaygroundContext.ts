/**
 * @file src/ReactAiPlayground/AIPlaygroundContext.tsx
 * @description AI Playground 工作区类型定义与纯函数工具集
 * 原先在此维护的全局状态 Context 已迁移至 Zustand（见 src/store/playgroundStore.ts），
 * 本文件仅保留跨模块复用的类型与工作区归一化/持久化相关的纯函数。
 * @author React AI Playground
 */

import { fileName2Language } from '@/ReactAiPlayground/utils';
import {
    APP_COMPONENT_FILE_NAME,
    initFiles,
} from '@/ReactAiPlayground/files';

export interface File {
    name: string
    value: string
    language: string
}

export interface Files {
    [key: string]: File
}

export interface ConversationWorkspace {
    files: Files
    selectedFileName: string
    contextFiles: string[]
}

export interface WriteFileOptions {
    select?: boolean
}

export const DEFAULT_SELECTED_FILE_NAME = APP_COMPONENT_FILE_NAME

// 避免默认模板对象被直接引用后在运行时串改。
const cloneFiles = (files: Files): Files => {
    return Object.fromEntries(
        Object.entries(files).map(([name, file]) => [name, { ...file }])
    )
}

export const createFile = (name: string, value = ''): File => ({
    name,
    value,
    language: fileName2Language(name),
})

// 统一补齐文件结构，兼容旧快照里缺失 language 等字段的情况。
const normalizeFiles = (files?: Files) => {
    if (!files || Object.keys(files).length === 0) {
        return cloneFiles(initFiles)
    }

    return Object.fromEntries(
        Object.entries(files).map(([name, file]) => [
            name,
            {
                name,
                value: file?.value ?? '',
                language: file?.language || fileName2Language(name),
            }
        ])
    )
}

export const createTemplateWorkspace = (): ConversationWorkspace => ({
    files: cloneFiles(initFiles),
    selectedFileName: DEFAULT_SELECTED_FILE_NAME,
    contextFiles: [],
})

const isConversationWorkspace = (
    workspace: Partial<ConversationWorkspace> | Files
): workspace is ConversationWorkspace => {
    const maybeWorkspace = workspace as Partial<ConversationWorkspace>

    return (
        typeof maybeWorkspace === 'object' &&
        maybeWorkspace !== null &&
        !!maybeWorkspace.files &&
        typeof maybeWorkspace.selectedFileName === 'string' &&
        Array.isArray(maybeWorkspace.contextFiles)
    )
}

export const normalizeWorkspace = (
    workspace?: Partial<ConversationWorkspace> | Files | null
): ConversationWorkspace => {
    if (!workspace) {
        return createTemplateWorkspace()
    }

    const isWorkspaceShape = isConversationWorkspace(workspace)
    const nextFiles = normalizeFiles(
        isWorkspaceShape ? workspace.files : workspace as Files
    )

    const availableFileNames = Object.keys(nextFiles)
    const nextSelectedFileName = (
        isWorkspaceShape && workspace.selectedFileName && nextFiles[workspace.selectedFileName]
            ? workspace.selectedFileName
            : availableFileNames.includes(DEFAULT_SELECTED_FILE_NAME)
                ? DEFAULT_SELECTED_FILE_NAME
                : availableFileNames[0]
    ) || DEFAULT_SELECTED_FILE_NAME

    const nextContextFilesSource = isWorkspaceShape ? workspace.contextFiles : []
    const nextContextFiles = nextContextFilesSource.filter(
        (fileName, index, arr) => nextFiles[fileName] && arr.indexOf(fileName) === index
    )

    return {
        files: nextFiles,
        selectedFileName: nextSelectedFileName,
        contextFiles: nextContextFiles,
    }
}
