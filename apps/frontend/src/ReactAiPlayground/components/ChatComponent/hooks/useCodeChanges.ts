/**
 * @file src/ReactAiPlayground/components/ChatComponent/hooks/useCodeChanges.ts
 * @description 代码变更面板状态绑定 hook
 *
 * 代码提取已迁移到后端：前端不再从 AI 回复文本里正则提取代码，而是消费后端
 * 下发的 file_start / code / file_end 事件，由 useChatStream 实时写入 codeChangesStore。
 * 本 hook 仅负责把 store 中的变更列表与操作方法暴露给面板组件。
 */

import { useCodeChangesStore } from '@/store/codeChangesStore';

export const useCodeChanges = () => {
    const codeChanges = useCodeChangesStore((state) => state.codeChanges);
    const showChangesPanel = useCodeChangesStore((state) => state.showChangesPanel);
    const setShowChangesPanel = useCodeChangesStore((state) => state.setShowChangesPanel);
    const handleApplyChange = useCodeChangesStore((state) => state.applyChange);
    const handleRevertChange = useCodeChangesStore((state) => state.revertChange);
    const handleApplyAll = useCodeChangesStore((state) => state.applyAll);
    const handleRevertAll = useCodeChangesStore((state) => state.revertAll);
    const handleClearChanges = useCodeChangesStore((state) => state.clearChanges);

    const pendingChangesCount = codeChanges.filter((c) => !c.applied).length;

    return {
        codeChanges,
        showChangesPanel,
        setShowChangesPanel,
        handleApplyChange,
        handleRevertChange,
        handleApplyAll,
        handleRevertAll,
        handleClearChanges,
        pendingChangesCount,
    };
};
