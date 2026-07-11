/**
 * @file src/ReactAiPlayground/components/ChatComponent/CodeChangesPanel/index.tsx
 * @description 代码变更面板组件
 * 展示 AI 回复中的代码变更列表，支持行级 diff 对比和一键应用/撤销
 * @author React AI Playground
 */

import { useMemo, useState, useCallback } from 'react';

// 第三方库 - 图标组件
import {
    X,
    Check,
    RotateCcw,
    FileCode,
    ChevronDown,
    ChevronRight,
    Layers,
} from 'lucide-react';

// 第三方库 - 文本差异对比
import { diffLines } from 'diff';

// 项目内部模块 - 全局工作区状态
import { usePlaygroundStore } from '@/store/playgroundStore';
import { type File } from '@/ReactAiPlayground/AIPlaygroundContext';

// 样式文件
import styles from '@/ReactAiPlayground/components/ChatComponent/CodeChangesPanel/index.module.scss';

/**
 * 代码变更数据结构
 * @description 描述 AI 回复中单次代码修改的完整信息，包括新旧内容、应用状态和分组标识
 */
export interface CodeChange {
    id: string;
    fileName: string;
    oldValue: string;
    newValue: string;
    timestamp: number;
    applied: boolean;
    isNewFile: boolean;
    groupId: string;
    groupTimestamp: number;
}

/**
 * 代码变更面板属性接口
 */
interface CodeChangesPanelProps {
    /** 所有代码变更列表 */
    changes: CodeChange[];
    /** 关闭面板回调 */
    onClose: () => void;
    /** 应用单个变更回调 */
    onApplyChange: (change: CodeChange) => void;
    /** 撤销单个变更回调 */
    onRevertChange: (change: CodeChange) => void;
    /** 清空所有变更回调 */
    onClearChanges: () => void;
    /** 批量应用所有变更回调 */
    onApplyAll: () => void;
    /** 批量撤销所有变更回调 */
    onRevertAll: () => void;
}

/**
 * 变更分组接口
 * @description 按 groupId 聚合同一轮 AI 回复产生的所有代码变更
 */
interface ChangeGroup {
    /** 分组唯一标识（与 requestId 对应） */
    id: string;
    /** 分组时间戳 */
    timestamp: number;
    /** 该分组下的所有变更 */
    changes: CodeChange[];
}

/**
 * 差异行组件
 * @description 渲染单行 diff，用颜色和前缀区分新增、删除和未变更行
 */
const DiffLine = ({ type, content }: { type: 'added' | 'removed' | 'unchanged'; content: string }) => {
    const lineClass = {
        added: styles.lineAdded,
        removed: styles.lineRemoved,
        unchanged: styles.lineUnchanged,
    }[type];

    const prefix = {
        added: '+',
        removed: '-',
        unchanged: ' ',
    }[type];

    return (
        <div className={`${styles.diffLine} ${lineClass}`}>
            <span className={styles.linePrefix}>{prefix}</span>
            <span className={styles.lineContent}>{content}</span>
        </div>
    );
};

/**
 * 单个变更项组件
 * @description 展示单个代码变更项，支持展开查看行级 diff、应用或撤销变更
 */
const ChangeItem = ({
    change,
    currentFile,
    isExpanded,
    onToggle,
    onApply,
    onRevert,
}: {
    change: CodeChange;
    currentFile: File | undefined;
    isExpanded: boolean;
    onToggle: () => void;
    onApply: () => void;
    onRevert: () => void;
}) => {
    const diffResult = useMemo(() => {
        const oldContent = change.applied
            ? change.oldValue
            : (currentFile?.value || '');
        const newContent = change.applied
            ? (currentFile?.value || '')
            : change.newValue;

        return diffLines(oldContent, newContent);
    }, [change, currentFile]);

    const stats = useMemo(() => {
        let added = 0;
        let removed = 0;

        diffResult.forEach((part) => {
            if (part.added) {
                added += part.value.split('\n').filter(line => line !== '').length;
            }

            if (part.removed) {
                removed += part.value.split('\n').filter(line => line !== '').length;
            }
        });

        return { added, removed };
    }, [diffResult]);

    return (
        <div className={`${styles.changeItem} ${change.applied ? styles.applied : ''}`}>
            <div className={styles.changeHeader} onClick={onToggle}>
                <div className={styles.headerLeft}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <FileCode size={16} />
                    <span className={styles.fileName}>{change.fileName}</span>
                    <span className={styles.stats}>
                        {stats.added > 0 && <span className={styles.added}>+{stats.added}</span>}
                        {stats.removed > 0 && <span className={styles.removed}>-{stats.removed}</span>}
                    </span>
                </div>
                <div className={styles.headerActions}>
                    {change.applied ? (
                        <button
                            className={`${styles.actionBtn} ${styles.revertBtn}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                onRevert();
                            }}
                            title="撤销"
                        >
                            <RotateCcw size={14} />
                        </button>
                    ) : (
                        <button
                            className={`${styles.actionBtn} ${styles.applyBtn}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                onApply();
                            }}
                            title="应用"
                        >
                            <Check size={14} />
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className={styles.diffContent}>
                    {diffResult.map((part, index) => {
                        const lines = part.value.split('\n').filter((_, lineIndex, arr) => (
                            lineIndex < arr.length - 1 || part.value.endsWith('\n') || part.value === ''
                        ));

                        return lines.map((line, lineIndex) => (
                            <DiffLine
                                key={`${index}-${lineIndex}`}
                                type={part.added ? 'added' : part.removed ? 'removed' : 'unchanged'}
                                content={line}
                            />
                        ));
                    })}
                </div>
            )}
        </div>
    );
};

/**
 * 代码变更面板组件
 * @description 按 AI 回复分组展示代码变更列表，支持查看 diff、批量应用和批量撤销
 */
const CodeChangesPanel = ({
    changes,
    onClose,
    onApplyChange,
    onRevertChange,
    onApplyAll,
    onRevertAll,
}: CodeChangesPanelProps) => {
    const files = usePlaygroundStore((state) => state.files);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleExpanded = useCallback((id: string) => {
        setExpandedItems((prev) => {
            const next = new Set(prev);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }, []);

    const stats = useMemo(() => {
        const total = changes.length;
        const applied = changes.filter(change => change.applied).length;
        const pending = total - applied;

        return { total, applied, pending };
    }, [changes]);

    const groupedChanges = useMemo(() => {
        const groups = new Map<string, ChangeGroup>();

        changes.forEach((change) => {
            const existingGroup = groups.get(change.groupId);

            if (existingGroup) {
                existingGroup.changes.push(change);
                existingGroup.timestamp = Math.max(existingGroup.timestamp, change.groupTimestamp);
                return;
            }

            groups.set(change.groupId, {
                id: change.groupId,
                timestamp: change.groupTimestamp,
                changes: [change],
            });
        });

        return Array.from(groups.values())
            .sort((left, right) => right.timestamp - left.timestamp)
            .map(group => ({
                ...group,
                changes: [...group.changes].sort((left, right) => left.timestamp - right.timestamp),
            }));
    }, [changes]);

    if (changes.length === 0) {
        return (
            <div className={styles.panelContainer}>
                <div className={styles.panelHeader}>
                    <h3>
                        <Layers size={15} />
                        代码变更
                    </h3>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={15} />
                    </button>
                </div>
                <div className={styles.emptyState}>
                    <FileCode size={48} />
                    <p>暂无代码变更</p>
                    <span>AI 返回的代码修改会显示在这里</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.panelContainer}>
            <div className={styles.panelHeader}>
                <h3>
                    <Layers size={15} />
                    代码变更
                    <span className={styles.badge}>
                        {stats.pending > 0 ? `${stats.pending} 待应用` : '全部完成'}
                    </span>
                </h3>
                <button className={styles.closeBtn} onClick={onClose}>
                    <X size={15} />
                </button>
            </div>

            <div className={styles.batchActions}>
                {stats.pending > 0 && (
                    <button className={styles.batchApplyBtn} onClick={onApplyAll}>
                        <Check size={14} />
                        应用全部 ({stats.pending})
                    </button>
                )}
                {stats.applied > 0 && (
                    <button className={styles.batchRevertBtn} onClick={onRevertAll}>
                        <RotateCcw size={14} />
                        撤销全部 ({stats.applied})
                    </button>
                )}
            </div>

            <div className={styles.changesList}>
                {groupedChanges.map((group) => (
                    <section key={group.id} className={styles.changeGroup}>
                        <div className={styles.groupItems}>
                            {group.changes.map(change => (
                                <ChangeItem
                                    key={change.id}
                                    change={change}
                                    currentFile={files[change.fileName]}
                                    isExpanded={expandedItems.has(change.id)}
                                    onToggle={() => toggleExpanded(change.id)}
                                    onApply={() => onApplyChange(change)}
                                    onRevert={() => onRevertChange(change)}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default CodeChangesPanel;
