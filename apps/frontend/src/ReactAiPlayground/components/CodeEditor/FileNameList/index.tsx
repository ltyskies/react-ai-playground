/**
 * @file src/ReactAiPlayground/components/CodeEditor/FileNameList/index.tsx
 * @description 编辑器文件标签列表组件
 * 负责展示、创建、删除和重命名工作区文件
 * @author React AI Playground
 */

import { useContext, useEffect, useState } from 'react';

import { AIPlaygroundContext } from '@/ReactAiPlayground/AIPlaygroundContext';
import { APP_COMPONENT_FILE_NAME, ENTRY_FILE_NAME, IMPORT_MAP_FILE_NAME } from '@/ReactAiPlayground/files';

import { FileNameItem } from './FileNameItem';

import styles from './index.module.scss';

/**
 * 文件标签列表组件
 * 将 Context 中的文件集合映射为可编辑的标签页列表
 */
export default function FileNameList() {
    const {
        files,
        removeFile,
        addFile,
        updateFileName,
        selectedFileName,
        setSelectedFileName,
    } = useContext(AIPlaygroundContext);

    // tabs 仅作为渲染顺序的本地快照，创建态用于让最后一个标签直接进入重命名。
    const [tabs, setTabs] = useState(['']);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        // 文件集合变化后，同步刷新标签页列表。
        setTabs(Object.keys(files));
    }, [files]);

    const handleEditComplete = (name: string, prevName: string) => {
        // 重命名成功后切换到新文件名，保证编辑器继续聚焦当前文件。
        updateFileName(prevName, name);
        setSelectedFileName(name);
        setCreating(false);
    };

    const addTab = () => {
        // 先生成一个临时文件名占位，随后由 FileNameItem 接管重命名交互。
        addFile(`comp${Math.random().toString().slice(2, 6)}.tsx`);
        setCreating(true);
    };

    const handleRemove = (name: string) => {
        removeFile(name);
    };

    // 入口文件、App 文件和 import-map 由系统维护，不允许直接删除或改名。
    const readonlyFileNames = [ENTRY_FILE_NAME, IMPORT_MAP_FILE_NAME, APP_COMPONENT_FILE_NAME];

    return (
        <div className={styles.tabs}>
            {tabs.map((item, index, arr) => (
                <FileNameItem
                    key={item + index}
                    value={item}
                    creating={creating && index === arr.length - 1}
                    readonly={readonlyFileNames.includes(item)}
                    actived={selectedFileName === item}
                    onClick={() => setSelectedFileName(item)}
                    onEditComplete={(name: string) => handleEditComplete(name, item)}
                    onRemove={() => {
                        handleRemove(item);
                    }}
                >
                </FileNameItem>
            ))}
            <div className={styles.add} onClick={addTab}>
                +
            </div>
        </div>
    );
}
