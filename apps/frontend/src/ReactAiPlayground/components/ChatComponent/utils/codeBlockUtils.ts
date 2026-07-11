/**
 * @file src/ReactAiPlayground/components/ChatComponent/utils/codeBlockUtils.ts
 * @description 代码块解析工具
 * 统一处理聊天消息里的 fenced code block 元信息，供渲染和自动应用共用
 * @author React AI Playground
 */

interface ParsedCodeBlockInfo {
    language?: string
    fileName?: string
}

/**
 * 从 Markdown 代码块元信息里提取文件名。
 * 兼容 `filename="App.tsx"`、`:App.tsx` 和纯文件名三种写法。
 */
const extractFileNameFromMeta = (meta: string): string | undefined => {
    const fileNameMatch = meta.match(/filename=["']([^"']+)["']/)
    if (fileNameMatch) {
        return fileNameMatch[1]
    }

    const colonMatch = meta.match(/^:(.+)$/)
    if (colonMatch) {
        return colonMatch[1].trim()
    }

    if (meta.trim() && !meta.includes('=') && !meta.includes(':')) {
        return meta.trim()
    }

    return undefined
}

/**
 * 解析代码块信息字符串，拆出语言和文件名。
 * 例如 `tsx:App.tsx` 会被解析为 `{ language: 'tsx', fileName: 'App.tsx' }`。
 */
export const parseCodeBlockInfo = (info: string | undefined): ParsedCodeBlockInfo => {
    const trimmedInfo = info?.trim()
    if (!trimmedInfo) {
        return {}
    }

    const languageMatch = trimmedInfo.match(/^([^\s:]+)(.*)$/)
    if (!languageMatch) {
        return {}
    }

    const [, language, rest] = languageMatch
    const meta = rest.trim()

    return {
        language,
        fileName: meta ? extractFileNameFromMeta(meta) : undefined,
    }
}

/**
 * 给 Markdown 渲染层使用的文件名提取方法。
 * 优先解析 fenced code block 的 meta，兜底兼容旧的 className 协议。
 */
export const extractCodeBlockFileName = (
    meta: string | undefined,
    className: string | undefined
) => {
    const trimmedMeta = meta?.trim()
    if (trimmedMeta) {
        const metaFileName = extractFileNameFromMeta(trimmedMeta)
        if (metaFileName) {
            return metaFileName
        }
    }

    if (className) {
        const classMatch = className.match(/language-\w+:(.+)/)
        if (classMatch) {
            return classMatch[1].trim()
        }
    }

    return undefined
}
