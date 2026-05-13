/**
 * @file src/ReactAiPlayground/components/ChatComponent/useCodeChanges.ts
 * @description 代码变更管理 hook
 * 管理 AI 回复中代码变更的自动提取、应用和撤销操作
 * @author React AI Playground
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Files } from '@/ReactAiPlayground/AIPlaygroundContext';
import type { Message } from '@/store/chatStore';
import type { CodeChange } from './CodeChangesPanel';
import { extractAutoApplicableCodeBlocks } from './codeBlockUtils';

/** 从 AI 回复中提取的代码变更摘要类型 */
type ExtractedCodeChange = Pick<CodeChange, 'fileName' | 'oldValue' | 'newValue' | 'applied' | 'isNewFile'>

// 从 AI 回复里提取出可以直接应用到工作区的文件变更，并去掉已存在的重复项
const extractCodeChanges = (
    content: string,
    existingChanges: CodeChange[],
    files: Files
): ExtractedCodeChange[] => {
    const changes: ExtractedCodeChange[] = [];
    const codeBlocks = extractAutoApplicableCodeBlocks(content);

    for (const { fileName: trimmedFileName, code: trimmedCode } of codeBlocks) {
        if (trimmedFileName && trimmedCode) {
            const isDuplicate = existingChanges.some(
                c => c.fileName === trimmedFileName && c.newValue === trimmedCode
            );

            if (!isDuplicate) {
                const isNewFile = !files[trimmedFileName];
                changes.push({
                    fileName: trimmedFileName,
                    oldValue: files[trimmedFileName]?.value || '',
                    newValue: trimmedCode,
                    applied: false,
                    isNewFile,
                });
            }
        }
    }

    return changes;
};

interface UseCodeChangesOptions {
    messages: Message[]
    isTyping: boolean
    files: Files
    writeFile: (fileName: string, value: string, options?: { select?: boolean }) => void
    removeFile: (fileName: string) => void
    updateFileValue: (fileName: string, value: string) => void
}

export const useCodeChanges = ({
    messages,
    isTyping,
    files,
    writeFile,
    removeFile,
    updateFileValue,
}: UseCodeChangesOptions) => {
    const [codeChanges, setCodeChanges] = useState<CodeChange[]>([]);
    const [showChangesPanel, setShowChangesPanel] = useState(false);
    const previousIsTypingRef = useRef(isTyping);

    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastMessageId = lastMessage?.id ?? null;
    const lastMessageContent = lastMessage?.content ?? '';
    const lastMessageRole = lastMessage?.role ?? null;
    const lastMessageStatus = lastMessage?.status ?? null;
    const lastMessageRequestId = lastMessage?.requestId;

    useEffect(() => {
        const shouldExtractChanges =
            previousIsTypingRef.current &&
            !isTyping &&
            lastMessageRole === 'assistant' &&
            lastMessageStatus === 'completed' &&
            !!lastMessageContent;

        if (shouldExtractChanges) {
            const changes = extractCodeChanges(lastMessageContent, codeChanges, files);
            if (changes.length > 0) {
                const extractedAt = Date.now();
                const groupId = lastMessageRequestId || `code-change-group-${extractedAt}`;
                const newChanges: CodeChange[] = changes.map(change => ({
                    ...change,
                    id: `${change.fileName}-${extractedAt}-${Math.random().toString(36).slice(2, 11)}`,
                    timestamp: extractedAt,
                    groupId,
                    groupTimestamp: extractedAt,
                }));

                queueMicrotask(() => {
                    setCodeChanges(prev => [...prev, ...newChanges]);
                });
            }
        }

        previousIsTypingRef.current = isTyping;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastMessageId, isTyping, lastMessageStatus]);

    const handleApplyChange = useCallback((change: CodeChange) => {
        writeFile(change.fileName, change.newValue, { select: true });
        setCodeChanges(prev =>
            prev.map(c => c.id === change.id ? { ...c, applied: true } : c)
        );
    }, [writeFile]);

    const handleRevertChange = useCallback((change: CodeChange) => {
        if (change.isNewFile) {
            removeFile(change.fileName);
        } else {
            updateFileValue(change.fileName, change.oldValue);
        }

        setCodeChanges(prev =>
            prev.map(c => c.id === change.id ? { ...c, applied: false } : c)
        );
    }, [removeFile, updateFileValue]);

    const handleApplyAll = useCallback(() => {
        codeChanges
            .filter(c => !c.applied)
            .forEach(change => handleApplyChange(change));
    }, [codeChanges, handleApplyChange]);

    const handleRevertAll = useCallback(() => {
        codeChanges
            .filter(c => c.applied)
            .forEach(change => handleRevertChange(change));
    }, [codeChanges, handleRevertChange]);

    const handleClearChanges = useCallback(() => {
        setCodeChanges([]);
    }, []);

    const pendingChangesCount = codeChanges.filter(c => !c.applied).length;

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
