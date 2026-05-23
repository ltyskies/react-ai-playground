/**
 * @file src/ReactAiPlayground/AIPlaygroundContext.tsx
 * @description AI Playground 全局状态 Context
 * @author React AI Playground
 */

import { createContext, useEffect, useState, type PropsWithChildren } from 'react';
import { compress, fileName2Language, uncompress } from '@/ReactAiPlayground/utils';
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

export interface AIPlaygroundContext {
    files: Files
    selectedFileName: string
    contextFiles: string[]
    setSelectedFileName: (fileName: string) => void
    setContextFiles: (fileNames: string[]) => void
    setFiles: (files: Files) => void
    addFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    updateFileName: (oldFieldName: string, newFieldName: string) => void
    updateFileValue: (fileName: string, value: string) => void
    writeFile: (fileName: string, value: string, options?: WriteFileOptions) => void
    hydrateWorkspace: (workspace?: ConversationWorkspace | null) => void
    resetWorkspaceToTemplate: () => void
    isShow: boolean
    setIsShow: (show: boolean) => void
}

export const DEFAULT_SELECTED_FILE_NAME = APP_COMPONENT_FILE_NAME

const noop = () => {}

// 避免默认模板对象被直接引用后在运行时串改。
const cloneFiles = (files: Files): Files => {
    return Object.fromEntries(
        Object.entries(files).map(([name, file]) => [name, { ...file }])
    )
}

const createFile = (name: string, value = ''): File => ({
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

// 从 URL hash 恢复工作区，保证刷新后仍能回到上次编辑现场。
export const getWorkspaceFromUrl = () => {
    try {
        const hash = window.location.hash.slice(1)
        if (!hash) {
            return undefined
        }

        const parsed = JSON.parse(
            uncompress(decodeURIComponent(hash))
        ) as Partial<ConversationWorkspace> | Files

        return normalizeWorkspace(parsed)
    } catch (error) {
        console.error(error)
        return undefined
    }
}

export const AIPlaygroundContext = createContext<AIPlaygroundContext>({
    files: cloneFiles(initFiles),
    selectedFileName: DEFAULT_SELECTED_FILE_NAME,
    contextFiles: [],
    setSelectedFileName: noop,
    setContextFiles: noop,
    setFiles: noop,
    addFile: noop,
    removeFile: noop,
    updateFileName: noop,
    updateFileValue: noop,
    writeFile: noop,
    hydrateWorkspace: noop,
    resetWorkspaceToTemplate: noop,
    isShow: false,
    setIsShow: noop,
})

export const AIPlaygroundProvider = (props: PropsWithChildren) => {
    const { children } = props
    const initialWorkspace = getWorkspaceFromUrl() || createTemplateWorkspace()

    const [workspace, setWorkspace] = useState<ConversationWorkspace>(initialWorkspace)
    const [isShow, setIsShow] = useState(false)
    const { files, selectedFileName, contextFiles } = workspace

    const applyWorkspace = (nextWorkspace?: ConversationWorkspace | null) => {
        setWorkspace(normalizeWorkspace(nextWorkspace))
    }

    const updateWorkspace = (
        updater: (previousWorkspace: ConversationWorkspace) => ConversationWorkspace
    ) => {
        setWorkspace((previousWorkspace) => {
            const nextWorkspace = updater(previousWorkspace)
            if (nextWorkspace === previousWorkspace) {
                return previousWorkspace
            }

            return normalizeWorkspace(nextWorkspace)
        })
    }

    const setFiles = (nextFiles: Files) => {
        updateWorkspace((previousWorkspace) => ({
            ...previousWorkspace,
            files: nextFiles,
        }))
    }

    const setSelectedFileName = (fileName: string) => {
        updateWorkspace((previousWorkspace) => {
            if (!previousWorkspace.files[fileName]) {
                return previousWorkspace
            }

            return {
                ...previousWorkspace,
                selectedFileName: fileName,
            }
        })
    }

    const setContextFiles = (fileNames: string[]) => {
        updateWorkspace((previousWorkspace) => ({
            ...previousWorkspace,
            contextFiles: fileNames,
        }))
    }

    const addFile = (name: string) => {
        if (!name) {
            return
        }

        updateWorkspace((previousWorkspace) => {
            if (previousWorkspace.files[name]) {
                return previousWorkspace
            }

            return {
                ...previousWorkspace,
                files: {
                    ...previousWorkspace.files,
                    [name]: createFile(name),
                }
            }
        })
    }

    const writeFile = (fileName: string, value: string, options?: WriteFileOptions) => {
        if (!fileName) {
            return
        }

        updateWorkspace((previousWorkspace) => {
            const previousFile = previousWorkspace.files[fileName]

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
            }
        })
    }

    const removeFile = (name: string) => {
        updateWorkspace((previousWorkspace) => {
            if (!previousWorkspace.files[name]) {
                return previousWorkspace
            }

            const rest = { ...previousWorkspace.files }
            delete rest[name]
            const nextSelectedFileName = previousWorkspace.selectedFileName === name
                ? (rest[DEFAULT_SELECTED_FILE_NAME] ? DEFAULT_SELECTED_FILE_NAME : Object.keys(rest)[0] || DEFAULT_SELECTED_FILE_NAME)
                : previousWorkspace.selectedFileName

            return {
                files: rest,
                selectedFileName: nextSelectedFileName,
                contextFiles: previousWorkspace.contextFiles.filter((fileName) => fileName !== name),
            }
        })
    }

    const updateFileName = (oldFieldName: string, newFieldName: string) => {
        if (!newFieldName || oldFieldName === newFieldName) {
            return
        }

        updateWorkspace((previousWorkspace) => {
            if (!previousWorkspace.files[oldFieldName]) {
                return previousWorkspace
            }

            const { [oldFieldName]: previousFile, ...rest } = previousWorkspace.files
            const renamedFiles = {
                ...rest,
                [newFieldName]: {
                    ...previousFile,
                    name: newFieldName,
                    language: fileName2Language(newFieldName),
                },
            }

            return {
                files: renamedFiles,
                selectedFileName: previousWorkspace.selectedFileName === oldFieldName ? newFieldName : previousWorkspace.selectedFileName,
                contextFiles: previousWorkspace.contextFiles.map((fileName) => fileName === oldFieldName ? newFieldName : fileName),
            }
        })
    }

    const updateFileValue = (fileName: string, value: string) => {
        updateWorkspace((previousWorkspace) => {
            const previousFile = previousWorkspace.files[fileName]
            if (!previousFile) {
                return previousWorkspace
            }

            return {
                ...previousWorkspace,
                files: {
                    ...previousWorkspace.files,
                    [fileName]: {
                        ...previousFile,
                        value,
                    }
                }
            }
        })
    }

    const hydrateWorkspace = (workspace?: ConversationWorkspace | null) => {
        applyWorkspace(workspace)
    }

    const resetWorkspaceToTemplate = () => {
        applyWorkspace(createTemplateWorkspace())
    }

    useEffect(() => {
        // 工作区状态直接持久化到 hash，便于刷新恢复和分享链接。
        const hash = compress(JSON.stringify({
            files,
            selectedFileName,
            contextFiles,
        }))
        window.location.hash = encodeURIComponent(hash)
    }, [files, selectedFileName, contextFiles])

    return (
        <AIPlaygroundContext.Provider
            value={{
                isShow,
                setIsShow,
                files,
                selectedFileName,
                contextFiles,
                setSelectedFileName,
                setContextFiles,
                setFiles,
                addFile,
                removeFile,
                updateFileName,
                updateFileValue,
                writeFile,
                hydrateWorkspace,
                resetWorkspaceToTemplate,
            }}
        >
            {children}
        </AIPlaygroundContext.Provider>
    )
}
