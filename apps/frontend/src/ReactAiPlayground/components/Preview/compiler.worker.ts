/**
 * @file src/ReactAiPlayground/components/Preview/compiler.worker.ts
 * @description 代码编译 Web Worker
 * 在后台线程中使用 SWC wasm 编译 TypeScript/TSX 代码为 JavaScript，并支持模块级增量缓存
 * @author React AI Playground
 */

// SWC wasm - 用于在 Worker 中编译代码
import initSwc, { parseSync, transformSync } from '@swc/wasm-web'
import swcWasmUrl from '@swc/wasm-web/wasm_bg.wasm?url'

// 项目内部模块 - 类型定义
import type { File, Files } from '@/ReactAiPlayground/AIPlaygroundContext';

// 项目内部常量 - 入口文件名
import { ENTRY_FILE_NAME, IMPORT_MAP_FILE_NAME } from '@/ReactAiPlayground/files'

type ModuleKind = 'js' | 'css' | 'json'

interface CompileRequest {
    type: 'COMPILE'
    files: Files
}

interface CompileSuccess {
    type: 'COMPILED_CODE'
    code: string
}

interface CompileError {
    type: 'ERROR'
    message: string
}

interface ModuleCacheEntry {
    source: string
    kind: ModuleKind
    deps: string[]
    blobUrl: string
}

interface CompileContext {
    files: Files
    invalidatedModules: Set<string>
    nextCache: Map<string, ModuleCacheEntry>
    nextDependencyGraph: Map<string, Set<string>>
    nextReverseDependencyGraph: Map<string, Set<string>>
    createdBlobUrls: Set<string>
    blobUrlsToRevokeOnCommit: Set<string>
    compiledModules: Set<string>
    compilingModules: string[]
}

interface SwcSpan {
    start: number
    end: number
}

interface SwcStringLiteral {
    type: 'StringLiteral'
    value: string
    span: SwcSpan
    raw?: string
}

interface ModuleSpecifierReplacement {
    start: number
    end: number
    nextValue: string
}

interface Utf16Range {
    start: number
    end: number
}

interface SwcParserOptions {
    syntax: 'ecmascript' | 'typescript'
    jsx?: boolean
    tsx?: boolean
    decorators?: boolean
    dynamicImport?: boolean
}

type AstRecord = Record<string, unknown>

const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const CSS_EXTENSION = '.css'
const JSON_EXTENSION = '.json'

const moduleCache = new Map<string, ModuleCacheEntry>()
const dependencyGraph = new Map<string, Set<string>>()
const reverseDependencyGraph = new Map<string, Set<string>>()
const textEncoder = new TextEncoder()
let previousFileSnapshot: Record<string, string> = {}
let swcReadyPromise: Promise<void> | null = null

/**
 * 代码转换前预处理
 * 自动添加 React 导入（如果缺失）
 * @param filename - 文件名
 * @param code - 源代码
 * @returns 处理后的代码
 */
export const beforeTransformCode = (filename: string, code: string) => {
    let nextCode = code
    const regexReact = /import\s+React((\s*,)|(\s+from))/g

    if ((filename.endsWith('.jsx') || filename.endsWith('.tsx')) && !regexReact.test(code)) {
        nextCode = `import React from 'react';\n${code}`
    }

    return nextCode
}

/**
 * 初始化 SWC wasm
 * 仅在 Worker 内初始化一次，失败后允许下次重试
 */
const ensureSwcReady = async () => {
    if (!swcReadyPromise) {
        swcReadyPromise = Promise.resolve(initSwc({ module_or_path: swcWasmUrl }))
            .then(() => undefined)
            .catch((error) => {
                swcReadyPromise = null
                throw error
            })
    }

    await swcReadyPromise
}

/**
 * 创建 Blob URL
 * @param content - Blob 内容
 * @param type - MIME 类型
 * @returns Blob URL
 */
const createBlobUrl = (content: string, type = 'application/javascript') => {
    return URL.createObjectURL(new Blob([content], { type }))
}

/**
 * 回收一批 Blob URL
 * @param blobUrls - 待回收的 Blob URL 集合
 */
const revokeBlobUrls = (blobUrls: Iterable<string>) => {
    for (const blobUrl of blobUrls) {
        URL.revokeObjectURL(blobUrl)
    }
}

/**
 * 判断是否为 JS 模块文件
 * @param fileName - 文件名
 * @returns 是否为 JS 模块
 */
const isJsModule = (fileName: string) => {
    return JS_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

/**
 * 判断是否为预览编译链路中的模块文件
 * @param fileName - 文件名
 * @returns 是否为模块文件
 */
const isModuleFile = (fileName: string) => {
    return isJsModule(fileName)
        || fileName.endsWith(CSS_EXTENSION)
        || fileName.endsWith(JSON_EXTENSION)
}

/**
 * 获取模块类型
 * @param fileName - 文件名
 * @returns 模块类型
 */
const getModuleKind = (fileName: string): ModuleKind | null => {
    if (isJsModule(fileName)) return 'js'
    if (fileName.endsWith(CSS_EXTENSION)) return 'css'
    if (fileName.endsWith(JSON_EXTENSION)) return 'json'
    return null
}

/**
 * 获取文件内容快照
 * @param files - 当前文件集合
 * @returns 文件名到源码内容的映射
 */
const getFileSnapshot = (files: Files) => {
    const snapshot: Record<string, string> = {}

    Object.values(files).forEach((file) => {
        snapshot[file.name] = file.value
    })

    return snapshot
}

/**
 * 克隆依赖图
 * @param graph - 原始依赖图
 * @returns 克隆后的依赖图
 */
const cloneGraph = (graph: Map<string, Set<string>>) => {
    return new Map(
        Array.from(graph.entries()).map(([key, value]) => [key, new Set(value)])
    )
}

/**
 * 收集受影响的所有依赖方
 * @param seeds - 变更起点
 * @param graph - 反向依赖图
 * @returns 所有传递依赖方
 */
const collectDependents = (seeds: Iterable<string>, graph: Map<string, Set<string>>) => {
    const dependents = new Set<string>()
    const queue = Array.from(seeds)

    while (queue.length) {
        const current = queue.shift()
        if (!current) continue

        const parents = graph.get(current)
        if (!parents) continue

        parents.forEach((parent) => {
            if (dependents.has(parent)) return

            dependents.add(parent)
            queue.push(parent)
        })
    }

    return dependents
}

/**
 * 收集入口可达模块
 * @param entryFileName - 入口文件名
 * @param graph - 正向依赖图
 * @returns 可达模块集合
 */
const collectReachableModules = (entryFileName: string, graph: Map<string, Set<string>>) => {
    const reachable = new Set<string>()
    const stack = [entryFileName]

    while (stack.length) {
        const current = stack.pop()
        if (!current || reachable.has(current)) continue

        reachable.add(current)
        const deps = graph.get(current)
        if (!deps) continue

        deps.forEach((dep) => {
            if (!reachable.has(dep)) {
                stack.push(dep)
            }
        })
    }

    return reachable
}

/**
 * 更新模块依赖关系
 * @param fileName - 模块文件名
 * @param deps - 最新依赖列表
 * @param nextDependencyGraph - 正向依赖图
 * @param nextReverseDependencyGraph - 反向依赖图
 */
const setModuleDeps = (
    fileName: string,
    deps: string[],
    nextDependencyGraph: Map<string, Set<string>>,
    nextReverseDependencyGraph: Map<string, Set<string>>,
) => {
    const previousDeps = nextDependencyGraph.get(fileName) || new Set<string>()

    previousDeps.forEach((dep) => {
        if (deps.includes(dep)) return

        const parents = nextReverseDependencyGraph.get(dep)
        if (!parents) return

        parents.delete(fileName)
        if (!parents.size) {
            nextReverseDependencyGraph.delete(dep)
        }
    })

    nextDependencyGraph.set(fileName, new Set(deps))

    deps.forEach((dep) => {
        const parents = nextReverseDependencyGraph.get(dep) || new Set<string>()
        parents.add(fileName)
        nextReverseDependencyGraph.set(dep, parents)
    })
}

/**
 * 从依赖图中移除模块节点
 * @param fileName - 模块文件名
 * @param nextDependencyGraph - 正向依赖图
 * @param nextReverseDependencyGraph - 反向依赖图
 */
const removeModuleFromGraph = (
    fileName: string,
    nextDependencyGraph: Map<string, Set<string>>,
    nextReverseDependencyGraph: Map<string, Set<string>>,
) => {
    const deps = nextDependencyGraph.get(fileName)

    deps?.forEach((dep) => {
        const parents = nextReverseDependencyGraph.get(dep)
        if (!parents) return

        parents.delete(fileName)
        if (!parents.size) {
            nextReverseDependencyGraph.delete(dep)
        }
    })

    nextDependencyGraph.delete(fileName)
    nextReverseDependencyGraph.delete(fileName)
}

/**
 * 解析相对导入对应的工作区文件名（支持树状目录）
 * 以导入方所在目录为基准规范化相对路径，并按扩展名 / index 兜底命中
 * @param files - 当前文件集合
 * @param importerFileName - 发起导入的文件路径
 * @param modulePath - 导入路径
 * @returns 匹配到的文件名
 */
const resolveModuleFileName = (files: Files, importerFileName: string, modulePath: string) => {
    // 仅解析相对路径，裸模块交给 import-map 处理
    if (!modulePath.startsWith('.')) {
        return undefined
    }

    // 取导入方所在目录作为解析基准
    const importerDir = importerFileName.includes('/')
        ? importerFileName.slice(0, importerFileName.lastIndexOf('/'))
        : ''
    const segments = importerDir ? importerDir.split('/') : []

    // 规范化 . 与 ..，得到相对工作区根的路径
    modulePath.split('/').forEach((segment) => {
        if (segment === '' || segment === '.') {
            return
        }

        if (segment === '..') {
            segments.pop()
            return
        }

        segments.push(segment)
    })

    const base = segments.join('/')
    if (!base) {
        return undefined
    }

    // 依次尝试：原样命中（含后缀）→ 省略后缀 → 目录 index
    const candidates = [
        base,
        ...JS_EXTENSIONS.map((extension) => `${base}${extension}`),
        ...JS_EXTENSIONS.map((extension) => `${base}/index${extension}`),
    ]

    return candidates.find((fileName) => files[fileName])
}

/**
 * JSON 文件转换为 JS 模块
 * @param file - 文件对象
 * @returns JS 代码
 */
const json2Js = (file: File) => {
    return `export default ${file.value}`
}

/**
 * CSS 文件转换为 JS 模块
 * 动态创建 style 标签注入样式
 * @param file - 文件对象
 * @returns JS 代码
 */
const css2Js = (file: File) => {
    const randomId = new Date().getTime()
    // 文件名可能包含路径分隔符，转成合法 id 片段
    const safeName = file.name.replace(/[^\w-]/g, '_')
    return `
(() => {
    const stylesheet = document.createElement('style')
    stylesheet.setAttribute('id', 'style_${randomId}_${safeName}')
    document.head.appendChild(stylesheet)

    const styles = document.createTextNode(\`${file.value}\`)
    stylesheet.innerHTML = ''
    stylesheet.appendChild(styles)
})()
    `
}

/**
 * 获取 SWC Parser 配置
 * @param fileName - 文件名
 * @returns Parser 配置
 */
const getSwcParserOptions = (fileName: string): SwcParserOptions => {
    if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
        return {
            syntax: 'typescript',
            tsx: fileName.endsWith('.tsx'),
            decorators: false,
            dynamicImport: true,
        }
    }

    return {
        syntax: 'ecmascript',
        jsx: fileName.endsWith('.jsx'),
        dynamicImport: true,
    }
}

/**
 * 将 UTF-8 字节偏移转换为 JS 字符串下标
 * @param source - 源代码
 * @param byteOffset - UTF-8 字节偏移
 * @returns UTF-16 字符串下标
 */
const getUtf16IndexFromByteOffset = (source: string, byteOffset: number) => {
    if (byteOffset <= 0) {
        return 0
    }

    let currentByteOffset = 0
    let index = 0

    while (index < source.length) {
        if (currentByteOffset >= byteOffset) {
            return index
        }

        const codePoint = source.codePointAt(index)
        if (codePoint === undefined) {
            break
        }

        const char = String.fromCodePoint(codePoint)
        currentByteOffset += textEncoder.encode(char).length
        index += char.length
    }

    return source.length
}

/**
 * 判断截取文本是否与字符串字面量匹配
 * @param text - 截取的源码
 * @param value - 字面量值
 * @returns 是否匹配
 */
const isMatchingQuotedLiteral = (text: string, value: string) => {
    if (text.length < 2) {
        return false
    }

    const quote = text[0]
    const endQuote = text[text.length - 1]

    if ((quote !== '\'' && quote !== '"') || quote !== endQuote) {
        return false
    }

    return text.slice(1, -1) === value
}

/**
 * 基于 SWC span 找到源码中的字符串字面量范围
 * @param sourceCode - 源代码
 * @param literal - SWC 字符串字面量
 * @returns UTF-16 范围
 */
const getLiteralUtf16Range = (sourceCode: string, literal: SwcStringLiteral): Utf16Range => {
    const candidates = [
        { startByte: literal.span.start - 1, endByte: literal.span.end - 1 },
        { startByte: literal.span.start, endByte: literal.span.end },
        { startByte: literal.span.start - 1, endByte: literal.span.end },
        { startByte: literal.span.start, endByte: literal.span.end - 1 },
    ]

    for (const candidate of candidates) {
        if (candidate.startByte < 0 || candidate.endByte < candidate.startByte) {
            continue
        }

        const start = getUtf16IndexFromByteOffset(sourceCode, candidate.startByte)
        const end = getUtf16IndexFromByteOffset(sourceCode, candidate.endByte)
        const rawText = sourceCode.slice(start, end)

        if (isMatchingQuotedLiteral(rawText, literal.value)) {
            return { start, end }
        }
    }

    const literalTexts = Array.from(new Set([
        literal.raw,
        `'${literal.value}'`,
        `"${literal.value}"`,
    ].filter((text): text is string => !!text)))
    const approxStart = getUtf16IndexFromByteOffset(sourceCode, Math.max(0, literal.span.start - 1))

    let matchedRange: Utf16Range | null = null
    let smallestDistance = Number.POSITIVE_INFINITY

    literalTexts.forEach((literalText) => {
        let searchIndex = sourceCode.indexOf(literalText)

        while (searchIndex !== -1) {
            const distance = Math.abs(searchIndex - approxStart)
            if (distance < smallestDistance) {
                smallestDistance = distance
                matchedRange = {
                    start: searchIndex,
                    end: searchIndex + literalText.length,
                }
            }

            searchIndex = sourceCode.indexOf(literalText, searchIndex + literalText.length)
        }
    })

    if (matchedRange) {
        return matchedRange
    }

    throw new Error(`无法定位模块路径 "${literal.value}" 在源码中的位置`)
}

/**
 * 判断值是否为 SWC 字符串字面量
 * @param value - 待判断值
 * @returns 是否为 SWC 字符串字面量
 */
const isSwcStringLiteral = (value: unknown): value is SwcStringLiteral => {
    if (!value || typeof value !== 'object') {
        return false
    }

    const literal = value as Partial<SwcStringLiteral>
    return literal.type === 'StringLiteral'
        && typeof literal.value === 'string'
        && typeof literal.span?.start === 'number'
        && typeof literal.span?.end === 'number'
}

/**
 * 深度遍历 AST 节点
 * @param node - AST 节点
 * @param visitor - 访问回调
 */
const visitAstNode = (node: unknown, visitor: (value: AstRecord) => void) => {
    if (!node || typeof node !== 'object') {
        return
    }

    if (Array.isArray(node)) {
        node.forEach((item) => {
            visitAstNode(item, visitor)
        })
        return
    }

    const record = node as AstRecord

    if (typeof record.type === 'string') {
        visitor(record)
    }

    Object.values(record).forEach((value) => {
        if (value && typeof value === 'object') {
            visitAstNode(value, visitor)
        }
    })
}

/**
 * 处理相对模块路径，递归编译依赖并生成源码替换项
 * @param fileName - 当前模块文件名
 * @param modulePath - 原始模块路径
 * @param literal - 源码中的字符串字面量
 * @param sourceCode - 源代码
 * @param context - 本轮编译上下文
 * @param deps - 当前模块依赖列表
 * @param replacements - 模块路径替换列表
 */
const addRelativeModuleReplacement = (
    fileName: string,
    modulePath: string,
    literal: SwcStringLiteral,
    sourceCode: string,
    context: CompileContext,
    deps: string[],
    replacements: ModuleSpecifierReplacement[],
) => {
    if (!modulePath.startsWith('.')) {
        return
    }

    const resolvedFileName = resolveModuleFileName(context.files, fileName, modulePath)
    if (!resolvedFileName) {
        throw new Error(`模块 "${fileName}" 依赖的 "${modulePath}" 不存在`)
    }

    if (!deps.includes(resolvedFileName)) {
        deps.push(resolvedFileName)
    }

    const dependencyModule = compileModule(resolvedFileName, context)
    const range = getLiteralUtf16Range(sourceCode, literal)

    replacements.push({
        start: range.start,
        end: range.end,
        nextValue: JSON.stringify(dependencyModule.blobUrl),
    })
}

/**
 * 用 SWC AST 收集并重写模块路径
 * 覆盖 import/export from/import() 四类相对模块引用
 * @param fileName - 文件名
 * @param sourceCode - 源代码
 * @param context - 本轮编译上下文
 * @param deps - 当前模块依赖列表
 * @returns 已改写模块路径的源码
 */
const rewriteRelativeModuleSpecifiers = (
    fileName: string,
    sourceCode: string,
    context: CompileContext,
    deps: string[],
) => {
    const ast = parseSync(sourceCode, {
        ...getSwcParserOptions(fileName),
        target: 'es2022',
    }) as { body?: unknown[] }
    const replacements: ModuleSpecifierReplacement[] = []

    ast.body?.forEach((item) => {
        if (!item || typeof item !== 'object') {
            return
        }

        const moduleItem = item as AstRecord
        const source = moduleItem.source

        if (
            (moduleItem.type === 'ImportDeclaration'
                || moduleItem.type === 'ExportNamedDeclaration'
                || moduleItem.type === 'ExportAllDeclaration')
            && isSwcStringLiteral(source)
        ) {
            addRelativeModuleReplacement(
                fileName,
                source.value,
                source,
                sourceCode,
                context,
                deps,
                replacements,
            )
        }
    })

    visitAstNode(ast.body, (node) => {
        if (node.type !== 'CallExpression') {
            return
        }

        const callee = node.callee
        if (!callee || typeof callee !== 'object' || (callee as AstRecord).type !== 'Import') {
            return
        }

        const args = (
            (Array.isArray(node.arguments) ? node.arguments : undefined)
            || (Array.isArray(node.args) ? node.args : undefined)
        ) as unknown[] | undefined
        const firstArg = args?.[0]

        if (!firstArg || typeof firstArg !== 'object') {
            return
        }

        const expression = (firstArg as AstRecord).expression
        if (!isSwcStringLiteral(expression)) {
            return
        }

        addRelativeModuleReplacement(
            fileName,
            expression.value,
            expression,
            sourceCode,
            context,
            deps,
            replacements,
        )
    })

    if (!replacements.length) {
        return sourceCode
    }

    return replacements
        .sort((a, b) => b.start - a.start)
        .reduce((currentCode, replacement) => {
            return `${currentCode.slice(0, replacement.start)}${replacement.nextValue}${currentCode.slice(replacement.end)}`
        }, sourceCode)
}

/**
 * SWC 代码转换
 * 将 TypeScript/TSX 转换为 JavaScript，并在转换前改写相对模块引用
 * @param filename - 文件名
 * @param code - 源代码
 * @param context - 本轮编译上下文
 * @returns 转换后的代码与依赖列表
 */
const swcTransform = (filename: string, code: string, context: CompileContext) => {
    const nextCode = beforeTransformCode(filename, code)
    const deps: string[] = []
    const codeWithResolvedImports = rewriteRelativeModuleSpecifiers(filename, nextCode, context, deps)
    const result = transformSync(codeWithResolvedImports, {
        filename,
        swcrc: false,
        sourceMaps: false,
        isModule: true,
        jsc: {
            target: 'es2022',
            parser: getSwcParserOptions(filename),
            transform: {
                react: {
                    runtime: 'classic',
                    pragma: 'React.createElement',
                    pragmaFrag: 'React.Fragment',
                },
            },
        },
        module: {
            type: 'es6',
        },
    })
    const transformedCode = typeof result === 'string' ? result : result.code

    if (!transformedCode) {
        throw new Error(`模块 "${filename}" 编译后没有生成代码`)
    }

    return {
        code: transformedCode,
        deps,
    }
}

/**
 * 构建入口运行时代码
 * @param entryBlobUrl - 入口模块 Blob URL
 * @returns 注入 iframe 的入口代码
 */
const buildEntryCode = (entryBlobUrl: string) => {
    return `import ${JSON.stringify(entryBlobUrl)};`
}

/**
 * 获取错误信息文本
 * @param error - 错误对象
 * @returns 错误文本
 */
const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
        return error.message
    }

    if (typeof error === 'object' && error && 'message' in error) {
        return String(error.message)
    }

    return String(error)
}

/**
 * 清理已删除模块的缓存与 Blob
 * 保留旧依赖图用于继续向上游传播失效，直到下一次成功编译提交新图
 * @param removedModuleFiles - 已删除模块列表
 */
const cleanupRemovedModules = (removedModuleFiles: string[]) => {
    const revokedBlobUrls = new Set<string>()

    removedModuleFiles.forEach((fileName) => {
        const cachedEntry = moduleCache.get(fileName)
        if (!cachedEntry) return

        revokedBlobUrls.add(cachedEntry.blobUrl)
        moduleCache.delete(fileName)
    })

    revokeBlobUrls(revokedBlobUrls)
}

/**
 * 编译模块
 * 仅为失效模块重新生成 Blob，未失效模块直接复用缓存
 * @param fileName - 模块文件名
 * @param context - 本轮编译上下文
 * @returns 模块缓存项
 */
const compileModule = (fileName: string, context: CompileContext): ModuleCacheEntry => {
    const {
        files,
        invalidatedModules,
        nextCache,
        nextDependencyGraph,
        nextReverseDependencyGraph,
        createdBlobUrls,
        blobUrlsToRevokeOnCommit,
        compiledModules,
        compilingModules,
    } = context

    const file = files[fileName]
    if (!file) {
        throw new Error(`找不到模块 "${fileName}"`)
    }

    const kind = getModuleKind(fileName)
    if (!kind) {
        throw new Error(`文件 "${fileName}" 不是可预览编译的模块类型`)
    }

    const cachedEntry = nextCache.get(fileName)
    const shouldReuseCachedModule = !invalidatedModules.has(fileName)
        && !!cachedEntry
        && cachedEntry.source === file.value
        && cachedEntry.kind === kind

    if (compiledModules.has(fileName) && cachedEntry) {
        return cachedEntry
    }

    if (shouldReuseCachedModule && cachedEntry) {
        return cachedEntry
    }

    if (compilingModules.includes(fileName)) {
        throw new Error(`暂不支持循环依赖：${[...compilingModules, fileName].join(' -> ')}`)
    }

    compilingModules.push(fileName)

    try {
        let deps: string[] = []
        let code = ''

        if (kind === 'css') {
            code = css2Js(file)
        } else if (kind === 'json') {
            code = json2Js(file)
        } else {
            const transformedModule = swcTransform(fileName, file.value, context)
            code = transformedModule.code
            deps = transformedModule.deps
        }

        const nextBlobUrl = createBlobUrl(code)
        createdBlobUrls.add(nextBlobUrl)
        setModuleDeps(fileName, deps, nextDependencyGraph, nextReverseDependencyGraph)

        if (cachedEntry) {
            blobUrlsToRevokeOnCommit.add(cachedEntry.blobUrl)
        }

        const nextEntry: ModuleCacheEntry = {
            source: file.value,
            kind,
            deps,
            blobUrl: nextBlobUrl,
        }

        nextCache.set(fileName, nextEntry)
        compiledModules.add(fileName)

        return nextEntry
    } finally {
        compilingModules.pop()
    }
}

/**
 * 处理编译请求
 * 主线程继续发送完整文件集合，worker 内自行完成 diff 与增量编译
 * @param files - 当前文件集合
 * @returns 入口运行时代码
 */
export const compile = async (files: Files) => {
    await ensureSwcReady()

    const entryFile = files[ENTRY_FILE_NAME]
    if (!entryFile) {
        throw new Error(`找不到入口文件 "${ENTRY_FILE_NAME}"`)
    }

    const nextSnapshot = getFileSnapshot(files)
    const removedFiles = Object.keys(previousFileSnapshot).filter((fileName) => !nextSnapshot[fileName])
    const changedFiles = Object.keys(nextSnapshot).filter((fileName) => previousFileSnapshot[fileName] !== nextSnapshot[fileName])
    previousFileSnapshot = nextSnapshot

    const removedModuleFiles = removedFiles.filter((fileName) => isModuleFile(fileName))
    const changedModuleFiles = changedFiles.filter((fileName) => (
        isModuleFile(fileName) && fileName !== IMPORT_MAP_FILE_NAME
    ))
    const invalidatedModules = new Set<string>([
        ...changedModuleFiles,
        ...removedModuleFiles,
        ...collectDependents([...changedModuleFiles, ...removedModuleFiles], reverseDependencyGraph),
    ])

    cleanupRemovedModules(removedModuleFiles)

    const nextCache = new Map(moduleCache)
    const nextDependencyGraph = cloneGraph(dependencyGraph)
    const nextReverseDependencyGraph = cloneGraph(reverseDependencyGraph)
    const createdBlobUrls = new Set<string>()
    const blobUrlsToRevokeOnCommit = new Set<string>()

    try {
        const entryModule = compileModule(ENTRY_FILE_NAME, {
            files,
            invalidatedModules,
            nextCache,
            nextDependencyGraph,
            nextReverseDependencyGraph,
            createdBlobUrls,
            blobUrlsToRevokeOnCommit,
            compiledModules: new Set<string>(),
            compilingModules: [],
        })
        const reachableModules = collectReachableModules(ENTRY_FILE_NAME, nextDependencyGraph)

        const moduleNamesForPrune = new Set([
            ...nextCache.keys(),
            ...nextDependencyGraph.keys(),
        ])

        moduleNamesForPrune.forEach((fileName) => {
            if (reachableModules.has(fileName) && files[fileName] && nextCache.has(fileName)) return

            const cachedEntry = nextCache.get(fileName)
            if (cachedEntry) {
                blobUrlsToRevokeOnCommit.add(cachedEntry.blobUrl)
            }

            nextCache.delete(fileName)
            removeModuleFromGraph(fileName, nextDependencyGraph, nextReverseDependencyGraph)
        })

        moduleCache.clear()
        nextCache.forEach((entry, nextFileName) => {
            moduleCache.set(nextFileName, entry)
        })

        dependencyGraph.clear()
        nextDependencyGraph.forEach((deps, nextFileName) => {
            dependencyGraph.set(nextFileName, deps)
        })

        reverseDependencyGraph.clear()
        nextReverseDependencyGraph.forEach((parents, nextFileName) => {
            reverseDependencyGraph.set(nextFileName, parents)
        })

        revokeBlobUrls(blobUrlsToRevokeOnCommit)

        return buildEntryCode(entryModule.blobUrl)
    } catch (error) {
        revokeBlobUrls(createdBlobUrls)
        throw error
    }
}

/**
 * 监听主线程消息
 * 接收显式编译请求并返回编译结果
 */
self.addEventListener('message', async ({ data }: MessageEvent<CompileRequest>) => {
    if (data.type !== 'COMPILE') return

    try {
        const response: CompileSuccess = {
            type: 'COMPILED_CODE',
            code: await compile(data.files),
        }
        self.postMessage(response)
    } catch (error) {
        const response: CompileError = {
            type: 'ERROR',
            message: getErrorMessage(error),
        }
        self.postMessage(response)
    }
})
