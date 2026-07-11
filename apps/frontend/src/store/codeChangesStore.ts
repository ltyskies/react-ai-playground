/**
 * @file src/store/codeChangesStore.ts
 * @description 代码变更全局状态（Zustand）
 * 维护当前展示的代码变更列表与变更面板显隐，并封装应用/撤销逻辑。
 * 使用全局单例，状态不随路由页面卸载而销毁；会话切换时自动清空，仅展示单轮对话的 diff。
 * @author React AI Playground
 */

import { create } from 'zustand';
import { useChatStore } from '@/store/chatStore';
import { usePlaygroundStore } from '@/store/playgroundStore';
import type { CodeChange } from '@/ReactAiPlayground/components/ChatComponent/CodeChangesPanel';

/**
 * 代码变更状态接口
 * @description 定义代码变更模块的完整 Zustand store 结构与操作方法
 */
interface CodeChangesState {
    /** 当前展示的代码变更列表（仅保留最近一轮对话的变更） */
    codeChanges: CodeChange[];
    /** 变更面板是否展开 */
    showChangesPanel: boolean;
    /** 当前流式写入所属的分组（requestId），用于跨轮次替换变更 */
    streamingGroupId: string | null;
    setShowChangesPanel: (show: boolean) => void;
    setCodeChanges: (changes: CodeChange[]) => void;
    applyChange: (change: CodeChange) => void;
    revertChange: (change: CodeChange) => void;
    applyAll: () => void;
    revertAll: () => void;
    clearChanges: () => void;
    /** 开始某个文件的流式写入：跳转代码区、擦除/新建文件、登记变更 */
    beginFileStream: (
        groupId: string,
        file: { fileName: string; language: string; isNewFile: boolean; oldValue: string }
    ) => void;
    /** 追加一行代码到正在写入的文件 */
    appendFileLine: (fileName: string, line: string) => void;
    /** 结束某个文件的流式写入：用权威内容覆盖，标记完成 */
    finishFileStream: (fileName: string, content: string) => void;
    /** 流式请求失败时按旧内容回退当前分组已经写入 live workspace 的代码 */
    rollbackStreamingGroup: (groupId: string) => void;
}

/** 生成变更唯一 ID */
const createChangeId = (fileName: string, groupId: string) =>
    `${fileName}-${groupId}-${Math.random().toString(36).slice(2, 11)}`;

export const useCodeChangesStore = create<CodeChangesState>((set, get) => ({
    codeChanges: [],
    showChangesPanel: false,
    streamingGroupId: null,

    setShowChangesPanel: (show) => set({ showChangesPanel: show }),

    // 只保留单轮对话的变更：每次直接替换，丢弃之前的全部变更
    setCodeChanges: (changes) => set({ codeChanges: changes }),

    applyChange: (change) => {
        usePlaygroundStore.getState().writeFile(change.fileName, change.newValue, { select: true });
        set((state) => ({
            codeChanges: state.codeChanges.map((c) => (c.id === change.id ? { ...c, applied: true } : c)),
        }));
    },

    revertChange: (change) => {
        const playground = usePlaygroundStore.getState();
        if (change.isNewFile) {
            playground.removeFile(change.fileName);
        } else {
            playground.updateFileValue(change.fileName, change.oldValue);
        }

        set((state) => ({
            codeChanges: state.codeChanges.map((c) => (c.id === change.id ? { ...c, applied: false } : c)),
        }));
    },

    applyAll: () => {
        get().codeChanges.filter((c) => !c.applied).forEach((change) => get().applyChange(change));
    },

    revertAll: () => {
        get().codeChanges.filter((c) => c.applied).forEach((change) => get().revertChange(change));
    },

    clearChanges: () => set({ codeChanges: [], streamingGroupId: null }),

    beginFileStream: (groupId, file) => {
        const playground = usePlaygroundStore.getState();
        // 收到传代码信号：跳转到代码区，擦除已有代码 / 新建空文件并选中
        playground.setActiveTab('code');
        playground.writeFile(file.fileName, '', { select: true });

        set((state) => {
            const now = Date.now();
            // 新的一轮对话（groupId 变化）时替换掉上一轮的全部变更
            const isNewGroup = state.streamingGroupId !== groupId;
            const baseChanges = isNewGroup
                ? []
                : state.codeChanges.filter((c) => c.fileName !== file.fileName);

            const change: CodeChange = {
                id: createChangeId(file.fileName, groupId),
                fileName: file.fileName,
                oldValue: file.oldValue,
                newValue: '',
                timestamp: now,
                applied: true,
                isNewFile: file.isNewFile,
                groupId,
                groupTimestamp: now,
            };

            return {
                streamingGroupId: groupId,
                codeChanges: [...baseChanges, change],
            };
        });
    },

    appendFileLine: (fileName, line) => {
        const playground = usePlaygroundStore.getState();
        const current = playground.files[fileName]?.value ?? '';
        const nextValue = current + line + '\n';
        playground.updateFileValue(fileName, nextValue);

        set((state) => ({
            codeChanges: state.codeChanges.map((c) =>
                c.fileName === fileName && c.groupId === state.streamingGroupId
                    ? { ...c, newValue: nextValue }
                    : c
            ),
        }));
    },

    finishFileStream: (fileName, content) => {
        // 用后端校验后的权威内容覆盖，消除逐行拼接可能产生的尾部空行差异
        usePlaygroundStore.getState().updateFileValue(fileName, content);

        set((state) => ({
            codeChanges: state.codeChanges.map((c) =>
                c.fileName === fileName && c.groupId === state.streamingGroupId
                    ? { ...c, newValue: content, applied: true }
                    : c
            ),
        }));
    },

    rollbackStreamingGroup: (groupId) => {
        const playground = usePlaygroundStore.getState();
        const changes = get().codeChanges.filter((change) => change.groupId === groupId && change.applied);

        changes.forEach((change) => {
            if (change.isNewFile) {
                playground.removeFile(change.fileName);
            } else {
                playground.updateFileValue(change.fileName, change.oldValue);
            }
        });

        set((state) => ({
            codeChanges: state.codeChanges.map((change) =>
                change.groupId === groupId
                    ? { ...change, applied: false }
                    : change
            ),
            streamingGroupId: state.streamingGroupId === groupId ? null : state.streamingGroupId,
        }));
    },
}));

// 会话切换/新建/加载时清空变更，避免展示上一个会话遗留的 diff。
useChatStore.subscribe((state, prevState) => {
    if (state.conversationId !== prevState.conversationId) {
        useCodeChangesStore.getState().clearChanges();
        useCodeChangesStore.getState().setShowChangesPanel(false);
    }
});
