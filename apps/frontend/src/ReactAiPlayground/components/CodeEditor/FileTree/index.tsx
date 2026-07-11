/**
 * @file src/ReactAiPlayground/components/CodeEditor/FileTree/index.tsx
 * @description 树状文件浏览器
 * 从扁平的路径 key 集合派生出目录树，支持折叠展开、选中、新建、重命名和删除
 * @author React AI Playground
 */

import { useMemo, useRef, useState } from 'react';
import { Popconfirm } from 'antd';
import { ChevronRight, FilePlus, FileCode2, Folder, FolderOpen, X } from 'lucide-react';

import { usePlaygroundStore } from '@/store/playgroundStore';
import {
    APP_COMPONENT_FILE_NAME,
    ENTRY_FILE_NAME,
    IMPORT_MAP_FILE_NAME,
} from '@/ReactAiPlayground/files';

import styles from '@/ReactAiPlayground/components/CodeEditor/FileTree/index.module.scss';

/** 单个树节点：文件夹或文件 */
interface TreeNode {
    name: string
    path: string
    isFile: boolean
    children: TreeNode[]
}

/** 系统维护、不允许重命名或删除的文件 */
const READONLY_FILE_NAMES = [ENTRY_FILE_NAME, IMPORT_MAP_FILE_NAME, APP_COMPONENT_FILE_NAME];

/** playground 编译链路支持的文件类型 */
const SUPPORTED_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'css', 'json'];

/** 校验文件名后缀是否受支持 */
const isSupportedFileName = (name: string) => {
    const extension = name.split('.').pop()?.toLowerCase();
    return !!extension && SUPPORTED_EXTENSIONS.includes(extension);
};

/** 取路径所在目录，根级返回空串 */
const getDirName = (path: string) => (
    path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
);

/** 取路径最后一段文件名 */
const getBaseName = (path: string) => (
    path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
);

/** 将扁平的文件路径集合构建为目录树，并按“文件夹在前、同类按名排序”排列 */
const buildFileTree = (fileNames: string[]): TreeNode[] => {
    const root: TreeNode = { name: '', path: '', isFile: false, children: [] };

    fileNames.forEach((fullPath) => {
        const parts = fullPath.split('/');
        let current = root;

        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const path = parts.slice(0, index + 1).join('/');
            let child = current.children.find((node) => node.name === part && node.isFile === isFile);

            if (!child) {
                child = { name: part, path, isFile, children: [] };
                current.children.push(child);
            }

            current = child;
        });
    });

    const sortNode = (node: TreeNode) => {
        node.children.sort((a, b) => {
            if (a.isFile !== b.isFile) {
                return a.isFile ? 1 : -1;
            }
            return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortNode);
    };

    sortNode(root);
    return root.children;
};

/**
 * 树状文件浏览器组件
 */
export default function FileTree() {
    const files = usePlaygroundStore((state) => state.files);
    const selectedFileName = usePlaygroundStore((state) => state.selectedFileName);
    const setSelectedFileName = usePlaygroundStore((state) => state.setSelectedFileName);
    const addFile = usePlaygroundStore((state) => state.addFile);
    const removeFile = usePlaygroundStore((state) => state.removeFile);
    const updateFileName = usePlaygroundStore((state) => state.updateFileName);

    const tree = useMemo(() => buildFileTree(Object.keys(files)), [files]);

    // 折叠中的文件夹路径集合，默认全部展开
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    // 正在重命名的文件路径
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    // 是否处于“新建文件”输入态
    const [creating, setCreating] = useState(false);
    const [draftName, setDraftName] = useState('');
    const [error, setError] = useState('');

    const createInputRef = useRef<HTMLInputElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const toggleFolder = (path: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const startCreating = () => {
        setError('');
        setDraftName('');
        setCreating(true);
        setTimeout(() => createInputRef.current?.focus(), 0);
    };

    const commitCreate = () => {
        const name = draftName.trim().replace(/^\/+|\/+$/g, '');

        if (!name) {
            setCreating(false);
            setError('');
            return;
        }

        if (!isSupportedFileName(name)) {
            setError(`仅支持 ${SUPPORTED_EXTENSIONS.join(' / ')} 类型`);
            return;
        }

        if (files[name]) {
            setSelectedFileName(name);
        } else {
            addFile(name);
            setSelectedFileName(name);
        }

        setCreating(false);
        setDraftName('');
        setError('');
    };

    const startRenaming = (path: string) => {
        if (READONLY_FILE_NAMES.includes(path)) {
            return;
        }
        setError('');
        setRenamingPath(path);
        setTimeout(() => renameInputRef.current?.select(), 0);
    };

    const commitRename = (oldPath: string, nextBaseName: string) => {
        const trimmed = nextBaseName.trim();
        setRenamingPath(null);

        if (!trimmed || trimmed === getBaseName(oldPath)) {
            return;
        }

        if (!isSupportedFileName(trimmed)) {
            setError(`仅支持 ${SUPPORTED_EXTENSIONS.join(' / ')} 类型`);
            return;
        }

        const dir = getDirName(oldPath);
        const nextPath = dir ? `${dir}/${trimmed}` : trimmed;

        if (files[nextPath]) {
            setError(`文件 "${nextPath}" 已存在`);
            return;
        }

        updateFileName(oldPath, nextPath);
        setError('');
    };

    const renderNode = (node: TreeNode, depth: number) => {
        const indentStyle = { paddingLeft: `${8 + depth * 14}px` };

        if (!node.isFile) {
            const isOpen = !collapsed.has(node.path);
            return (
                <div key={`dir:${node.path}`}>
                    <div
                        className={styles.row}
                        style={indentStyle}
                        onClick={() => toggleFolder(node.path)}
                    >
                        <ChevronRight
                            size={14}
                            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
                        />
                        {isOpen
                            ? <FolderOpen size={15} className={styles.folderIcon} />
                            : <Folder size={15} className={styles.folderIcon} />}
                        <span className={styles.label}>{node.name}</span>
                    </div>
                    {isOpen && node.children.map((child) => renderNode(child, depth + 1))}
                </div>
            );
        }

        const isReadonly = READONLY_FILE_NAMES.includes(node.path);
        const isActive = selectedFileName === node.path;
        const isRenaming = renamingPath === node.path;

        return (
            <div
                key={`file:${node.path}`}
                className={`${styles.row} ${styles.fileRow} ${isActive ? styles.active : ''}`}
                style={indentStyle}
                onClick={() => setSelectedFileName(node.path)}
                onDoubleClick={() => startRenaming(node.path)}
            >
                <FileCode2 size={15} className={styles.fileIcon} />
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        className={styles.input}
                        defaultValue={node.name}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => commitRename(node.path, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitRename(node.path, e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                                setRenamingPath(null);
                            }
                        }}
                    />
                ) : (
                    <span className={styles.label}>{node.name}</span>
                )}
                {!isReadonly && !isRenaming && (
                    <Popconfirm
                        title="确认删除该文件吗？"
                        okText="确定"
                        cancelText="取消"
                        onConfirm={(e) => {
                            e?.stopPropagation();
                            removeFile(node.path);
                        }}
                    >
                        <span className={styles.removeBtn} onClick={(e) => e.stopPropagation()}>
                            <X size={13} />
                        </span>
                    </Popconfirm>
                )}
            </div>
        );
    };

    return (
        <div className={styles.tree}>
            <div className={styles.header}>
                <span className={styles.title}>文件</span>
                <button className={styles.addBtn} title="新建文件" onClick={startCreating}>
                    <FilePlus size={15} />
                </button>
            </div>

            <div className={styles.body}>
                {creating && (
                    <div className={styles.row} style={{ paddingLeft: '8px' }}>
                        <FileCode2 size={15} className={styles.fileIcon} />
                        <input
                            ref={createInputRef}
                            className={styles.input}
                            value={draftName}
                            placeholder="如 components/Button.tsx"
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={commitCreate}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitCreate();
                                } else if (e.key === 'Escape') {
                                    setCreating(false);
                                    setError('');
                                }
                            }}
                        />
                    </div>
                )}

                {tree.map((node) => renderNode(node, 0))}
            </div>

            {error && <div className={styles.error}>{error}</div>}
        </div>
    );
}
