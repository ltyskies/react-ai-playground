/**
 * @file src/ReactAiPlayground/components/CodeEditor/index.tsx
 * @description 代码编辑器容器组件
 * 负责串联文件标签页与 Monaco Editor，并对高频编辑输入做节流落盘
 * @author React AI Playground
 */

import { useContext, useEffect, useRef } from 'react';
import { debounce } from 'lodash-es';

import Editor from './Editor';
import FileNameList from './FileNameList';

import { AIPlaygroundContext } from '@/ReactAiPlayground/AIPlaygroundContext';

/**
 * 代码编辑器容器组件
 * 统一处理当前选中文件、编辑器内容变更和销毁时的防抖清理
 */
export default function CodeEditor() {
    const {
        files,
        updateFileValue,
        selectedFileName,
        setSelectedFileName,
    } = useContext(AIPlaygroundContext);

    // 选中文件被删除或重命名时，回退到当前文件列表里的第一个文件。
    const fallbackFileName = Object.keys(files)[0];
    const file = files[selectedFileName] ?? (fallbackFileName ? files[fallbackFileName] : undefined);
    const updateFileValueRef = useRef(updateFileValue);
    // 防抖包装需要长期复用，因此通过 ref 持有最新写入函数，避免每次渲染重建。
    const debouncedEditorChangeRef = useRef(
        debounce((fileName: string, value?: string) => {
            updateFileValueRef.current(fileName, value ?? '');
        }, 500)
    );

    updateFileValueRef.current = updateFileValue;

    useEffect(() => {
        // 文件名变化后，如果当前选中项失效，自动同步到新的有效文件。
        if (file && file.name !== selectedFileName) {
            setSelectedFileName(file.name);
        }
    }, [file, selectedFileName, setSelectedFileName]);

    useEffect(() => {
        return () => {
            // 组件卸载时取消待执行的写入，避免对已卸载组件继续更新。
            debouncedEditorChangeRef.current.cancel();
        };
    }, []);

    function onEditorChange(value?: string) {
        // 没有可编辑文件时直接忽略编辑器回调。
        if (!file) {
            return;
        }

        debouncedEditorChangeRef.current(file.name, value);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <FileNameList />
            <div style={{ flex: 1, minHeight: 0 }}>
                {file ? (
                    <Editor
                        file={file}
                        onChange={onEditorChange}
                        options={{
                            theme: 'vs-light'
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}
