/**
 * @file src/ReactAiPlayground/components/CodeEditor/Editor/index.tsx
 * @description Monaco Editor 代码编辑器组件
 * 基于 Monaco Editor 的代码编辑组件，支持 TypeScript、自动类型获取、代码格式化
 * @author React AI Playground
 */

// Monaco Editor React 封装
import MonacoEditor, { type OnMount, type EditorProps } from '@monaco-editor/react'

// 项目内部模块 - 自动类型获取
import { createATA } from './ata';

// Monaco Editor 核心类型
import { editor } from 'monaco-editor'

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
 */
export default function Editor(props: Props) {
    const {
        file,
        onChange,
        options
    } = props;

    /**
     * 编辑器挂载完成回调
     * 配置编辑器快捷键、TypeScript 编译器选项、自动类型获取
     * @param editor - Monaco Editor 实例
     * @param monaco - Monaco 核心对象
     */
    const handleEditorMount: OnMount = (editor, monaco) => {
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

    return (
        <MonacoEditor
            height={'100%'}
            path={file.name}
            language={file.language}
            onMount={handleEditorMount}
            onChange={onChange}
            value={file.value}
            options={{
                // 字体大小
                fontSize: 14,
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
