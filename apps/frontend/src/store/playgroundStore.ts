/**
 * @file src/store/playgroundStore.ts
 * @description AI Playground 工作区全局状态（Zustand）
 * 统一维护代码文件、当前选中文件、上下文文件等工作区状态。
 * 使用 Zustand 全局单例，状态不随路由页面卸载而销毁，切换页面再返回可保留改动。
 * @author React AI Playground
 */

import { create } from 'zustand';
import { fileName2Language } from '@/ReactAiPlayground/utils';
import {
    createFile,
    createTemplateWorkspace,
    normalizeWorkspace,
    DEFAULT_SELECTED_FILE_NAME,
    type ConversationWorkspace,
    type Files,
    type WriteFileOptions,
} from '@/ReactAiPlayground/AIPlaygroundContext';

/** 右侧面板视图 tab 类型 */
export type PlaygroundTab = 'preview' | 'code';

/**
 * 工作区状态接口
 * @description 定义工作区的完整 Zustand store 结构与操作方法，字段语义与原 AIPlaygroundContext 保持一致
 */
interface PlaygroundState extends ConversationWorkspace {
    /** 首次会话初始化是否已完成，用于避免 SPA 内跳转返回时重复初始化并清空状态 */
    initialized: boolean;
    /** 右侧面板当前展示的 tab（预览 / 代码），提升为全局状态以便流式写入时自动跳转到代码区 */
    activeTab: PlaygroundTab;
    setActiveTab: (tab: PlaygroundTab) => void;
    setSelectedFileName: (fileName: string) => void;
    setContextFiles: (fileNames: string[]) => void;
    setFiles: (files: Files) => void;
    addFile: (fileName: string) => void;
    removeFile: (fileName: string) => void;
    updateFileName: (oldFieldName: string, newFieldName: string) => void;
    updateFileValue: (fileName: string, value: string) => void;
    writeFile: (fileName: string, value: string, options?: WriteFileOptions) => void;
    hydrateWorkspace: (workspace?: ConversationWorkspace | null) => void;
    resetWorkspaceToTemplate: () => void;
    markInitialized: () => void;
}

const initialWorkspace = createTemplateWorkspace();

export const usePlaygroundStore = create<PlaygroundState>()((set, get) => {
    // 仅更新工作区三要素并统一归一化；updater 原样返回入参时视为无变化，跳过写入。
    const updateWorkspace = (
        updater: (previousWorkspace: ConversationWorkspace) => ConversationWorkspace
    ) => {
        const state = get();
        const previousWorkspace: ConversationWorkspace = {
            files: state.files,
            selectedFileName: state.selectedFileName,
            contextFiles: state.contextFiles,
        };

        const nextWorkspace = updater(previousWorkspace);
        if (nextWorkspace === previousWorkspace) {
            return;
        }

        set(normalizeWorkspace(nextWorkspace));
    };

    return {
        files: initialWorkspace.files,
        selectedFileName: initialWorkspace.selectedFileName,
        contextFiles: initialWorkspace.contextFiles,
        initialized: false,
        activeTab: 'preview',

        setActiveTab: (tab) => set({ activeTab: tab }),

        setFiles: (nextFiles) => {
            updateWorkspace((previousWorkspace) => ({
                ...previousWorkspace,
                files: nextFiles,
            }));
        },

        setSelectedFileName: (fileName) => {
            updateWorkspace((previousWorkspace) => {
                if (!previousWorkspace.files[fileName]) {
                    return previousWorkspace;
                }

                return {
                    ...previousWorkspace,
                    selectedFileName: fileName,
                };
            });
        },

        setContextFiles: (fileNames) => {
            updateWorkspace((previousWorkspace) => ({
                ...previousWorkspace,
                contextFiles: fileNames,
            }));
        },

        addFile: (name) => {
            if (!name) {
                return;
            }

            updateWorkspace((previousWorkspace) => {
                if (previousWorkspace.files[name]) {
                    return previousWorkspace;
                }

                return {
                    ...previousWorkspace,
                    files: {
                        ...previousWorkspace.files,
                        [name]: createFile(name),
                    },
                };
            });
        },

        writeFile: (fileName, value, options) => {
            if (!fileName) {
                return;
            }

            updateWorkspace((previousWorkspace) => {
                const previousFile = previousWorkspace.files[fileName];

                return {
                    files: {
                        ...previousWorkspace.files,
                        [fileName]: previousFile
                            ? {
                                ...previousFile,
                                value,
                            }
                            : createFile(fileName, value),
                    },
                    selectedFileName: options?.select ? fileName : previousWorkspace.selectedFileName,
                    contextFiles: previousWorkspace.contextFiles,
                };
            });
        },

        removeFile: (name) => {
            updateWorkspace((previousWorkspace) => {
                if (!previousWorkspace.files[name]) {
                    return previousWorkspace;
                }

                const rest = { ...previousWorkspace.files };
                delete rest[name];
                const nextSelectedFileName = previousWorkspace.selectedFileName === name
                    ? (rest[DEFAULT_SELECTED_FILE_NAME] ? DEFAULT_SELECTED_FILE_NAME : Object.keys(rest)[0] || DEFAULT_SELECTED_FILE_NAME)
                    : previousWorkspace.selectedFileName;

                return {
                    files: rest,
                    selectedFileName: nextSelectedFileName,
                    contextFiles: previousWorkspace.contextFiles.filter((fileName) => fileName !== name),
                };
            });
        },

        updateFileName: (oldFieldName, newFieldName) => {
            if (!newFieldName || oldFieldName === newFieldName) {
                return;
            }

            updateWorkspace((previousWorkspace) => {
                if (!previousWorkspace.files[oldFieldName]) {
                    return previousWorkspace;
                }

                const { [oldFieldName]: previousFile, ...rest } = previousWorkspace.files;
                const renamedFiles = {
                    ...rest,
                    [newFieldName]: {
                        ...previousFile,
                        name: newFieldName,
                        language: fileName2Language(newFieldName),
                    },
                };

                return {
                    files: renamedFiles,
                    selectedFileName: previousWorkspace.selectedFileName === oldFieldName ? newFieldName : previousWorkspace.selectedFileName,
                    contextFiles: previousWorkspace.contextFiles.map((fileName) => fileName === oldFieldName ? newFieldName : fileName),
                };
            });
        },

        updateFileValue: (fileName, value) => {
            updateWorkspace((previousWorkspace) => {
                const previousFile = previousWorkspace.files[fileName];
                if (!previousFile) {
                    return previousWorkspace;
                }

                return {
                    ...previousWorkspace,
                    files: {
                        ...previousWorkspace.files,
                        [fileName]: {
                            ...previousFile,
                            value,
                        },
                    },
                };
            });
        },

        hydrateWorkspace: (workspace) => {
            set(normalizeWorkspace(workspace));
        },

        resetWorkspaceToTemplate: () => {
            set(normalizeWorkspace(createTemplateWorkspace()));
        },

        markInitialized: () => set({ initialized: true }),
    };
});
