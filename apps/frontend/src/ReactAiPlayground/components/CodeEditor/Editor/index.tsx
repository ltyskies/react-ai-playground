/**
 * @file src/ReactAiPlayground/components/CodeEditor/Editor/index.tsx
 * @description Monaco Editor 代码编辑器组件
 * 基于 Monaco Editor 的代码编辑组件，支持 TypeScript、自动类型获取、代码格式化
 * @author React AI Playground
 */

// Monaco Editor React 封装
import { useEffect, useRef } from 'react'
import MonacoEditor, { type OnMount, type EditorProps } from '@monaco-editor/react'

// 项目内部模块 - 自动类型获取
import { createATA } from '@/ReactAiPlayground/components/CodeEditor/Editor/ata';

// Monaco Editor 核心类型
import { editor } from 'monaco-editor'
import type * as Monaco from 'monaco-editor'

/**
 * 编辑器文件对象接口
 */
export interface EditorFile {
    name: string        // 文件名
    value: string       // 文件内容
    language: string    // 语言类型
}

/**
 * 编辑器组件属性接口
 */
interface Props {
    file: EditorFile                                    // 当前编辑的文件
    onChange?: EditorProps['onChange']                 // 内容变化回调
    options?: editor.IStandaloneEditorConstructionOptions  // 编辑器配置选项
}

/**
 * Monaco Editor 代码编辑器组件
 * 支持语法高亮、自动补全、代码格式化等功能
 *
 * 采用非受控模式（defaultValue + path）并通过 editor 实例增量同步外部内容：
 * 流式逐行写入时只在文档末尾追加新增文本，避免整篇 setValue 导致的重排/重绘闪烁。
 */
export default function Editor(props: Props) {
    const {
        file,
        onChange,
        options
    } = props;

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof Monaco | null>(null);

    /**
     * 编辑器挂载完成回调
     * 配置编辑器快捷键、TypeScript 编译器选项、自动类型获取
     * @param editor - Monaco Editor 实例
     * @param monaco - Monaco 核心对象
     */
    const handleEditorMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // 注册格式化快捷键 Ctrl/Cmd + J
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
            editor.getAction('editor.action.formatDocument')?.run()
        });

        // 配置 TypeScript 编译器选项
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            jsx: monaco.languages.typescript.JsxEmit.Preserve,
            esModuleInterop: true,
        })

        // 创建自动类型获取实例
        const ata = createATA((code, path) => {
            // 将获取到的类型定义添加到 Monaco
            monaco.languages.typescript.typescriptDefaults.addExtraLib(code, `file://${path}`)
        })

        // 监听编辑器内容变化，触发类型获取
        editor.onDidChangeModelContent(() => {
            ata(editor.getValue());
        });

        // 初始类型获取
        ata(editor.getValue());
    }

    // 外部内容（流式写入 / 切换文件）变化时，增量同步到编辑器模型
    useEffect(() => {
        const editorInstance = editorRef.current;
        const monaco = monacoRef.current;
        if (!editorInstance || !monaco) {
            return;
        }

        const model = editorInstance.getModel();
        if (!model) {
            return;
        }

        const modelValue = model.getValue();
        if (modelValue === file.value) {
            return;
        }

        // 末尾追加：只在文档尾部插入新增片段，保持滚动/光标，避免整篇重绘
        if (file.value.startsWith(modelValue)) {
            // 记录追加前是否停在底部：仅当用户本就在底部时才跟随滚动，
            // 避免用户向上翻看时被强制拉回底部
            const scrollTop = editorInstance.getScrollTop();
            const scrollHeight = editorInstance.getScrollHeight();
            const viewportHeight = editorInstance.getLayoutInfo().height;
            const wasAtBottom = scrollTop + viewportHeight >= scrollHeight - 24;

            const appended = file.value.slice(modelValue.length);
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            editorInstance.executeEdits('stream-append', [{
                range: new monaco.Range(lastLine, lastColumn, lastLine, lastColumn),
                text: appended,
            }]);
            // 仅在追加前处于底部时才跟随写入滚动到底部
            if (wasAtBottom) {
                editorInstance.revealLine(model.getLineCount());
            }
        } else {
            // 非追加（切换文件或整体替换）时才整篇设置
            model.setValue(file.value);
        }
    }, [file.name, file.value]);

    return (
        <MonacoEditor
            height={'100%'}
            path={file.name}
            language={file.language}
            defaultValue={file.value}
            onMount={handleEditorMount}
            onChange={onChange}
            options={{
                // 字体大小
                fontSize: 14,
                // 隐藏态挂载后切回可见时自动重算尺寸，避免宽度为 0
                automaticLayout: true,
                // 禁止滚动到最后一行之后
                scrollBeyondLastLine: false,
                // 禁用缩略图
                minimap: {
                    enabled: false,
                },
                // 滚动条样式
                scrollbar: {
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6,
                },
                // 合并外部配置
                ...options
            }}
        />
    )
}
