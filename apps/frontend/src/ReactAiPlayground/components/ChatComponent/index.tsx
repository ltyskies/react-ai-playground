/**
 * @file src/ReactAiPlayground/components/ChatComponent/index.tsx
 * @description AI 聊天组件
 * 负责流式对话、上下文文件拼装和代码变更提取面板联动
 * @author React AI Playground
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import React from 'react';
import { createPortal } from 'react-dom';
import { VList, type VListHandle } from 'virtua';
import { throttle } from 'lodash-es';
import { Check, FileCode, Layers, Plus, Send, Square, X } from 'lucide-react';

import { useChatStore } from '@/store/chatStore';
import { usePlaygroundStore } from '@/store/playgroundStore';
import { type ConversationWorkspace } from '@/ReactAiPlayground/AIPlaygroundContext';
import { useFilePicker } from '@/ReactAiPlayground/components/ChatComponent/hooks/useFilePicker';
import { useChatStream } from '@/ReactAiPlayground/components/ChatComponent/hooks/useChatStream';
import { useCodeChanges } from '@/ReactAiPlayground/components/ChatComponent/hooks/useCodeChanges';
import { useFixCompilerError } from '@/ReactAiPlayground/components/ChatComponent/hooks/useFixCompilerError';

import styles from '@/ReactAiPlayground/components/ChatComponent/index.module.scss';

const CodeChangesPanel = React.lazy(() => import('@/ReactAiPlayground/components/ChatComponent/CodeChangesPanel'));
const MessageItem = React.lazy(() => import('@/ReactAiPlayground/components/ChatComponent/MessageItem'));

/**
 * Chat 组件外部属性
 */
interface ChatComponentProps {
    onBeforeSend?: () => Promise<void> | void
    onConversationUpdated?: () => Promise<void> | void
}

/**
 * AI 聊天组件
 * @description 负责流式对话的完整生命周期管理：发送消息、接收 SSE 流、代码变更提取和上下文文件联动
 */
const AIChat = ({ onBeforeSend, onConversationUpdated }: ChatComponentProps) => {
    const {
        messages,
        conversationId,
        isTyping,
    } = useChatStore();

    const files = usePlaygroundStore((state) => state.files);
    const selectedFileName = usePlaygroundStore((state) => state.selectedFileName);
    const contextFiles = usePlaygroundStore((state) => state.contextFiles);
    const setContextFiles = usePlaygroundStore((state) => state.setContextFiles);

    const [input, setInput] = useState('');
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    // 下拉框 Portal 到 body 后的定位（相对视口固定）
    const [pickerPos, setPickerPos] = useState<{ left: number; bottom: number } | null>(null);

    const scrollRef = useRef<VListHandle>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const workspace = useCallback((): ConversationWorkspace => ({
        files,
        selectedFileName,
        contextFiles,
    }), [contextFiles, files, selectedFileName]);

    const { submitChat, abortControllerRef } = useChatStream({
        getWorkspace: workspace,
        onBeforeSend,
        onConversationUpdated,
    });

    const {
        codeChanges,
        showChangesPanel,
        setShowChangesPanel,
        handleApplyChange,
        handleRevertChange,
        handleApplyAll,
        handleRevertAll,
        handleClearChanges,
        pendingChangesCount,
    } = useCodeChanges();

    const { showFilePicker, setShowFilePicker, pickerRef, dropdownRef } = useFilePicker();

    // 打开下拉框时按触发按钮位置计算 fixed 定位，并跟随窗口尺寸变化更新
    useLayoutEffect(() => {
        if (!showFilePicker) {
            return;
        }

        const updatePosition = () => {
            const trigger = pickerRef.current;
            if (!trigger) {
                return;
            }
            const rect = trigger.getBoundingClientRect();
            setPickerPos({
                left: rect.left,
                bottom: window.innerHeight - rect.top + 8,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [showFilePicker, pickerRef]);

    useFixCompilerError(submitChat);

    const handleRetry = useCallback((requestId: string) => {
        const userMessage = messages.find(
            (message) => message.role === 'user' && message.requestId === requestId
        )

        if (!userMessage?.content || isTyping) {
            return
        }

        // 失败/终止时该消息文字会被恢复到输入框，走重试按钮时一并清空，
        // 避免重试成功后输入框仍残留同一条文字；用户已改写为其他内容则不清空
        setInput((current) => (current.trim() === userMessage.content.trim() ? '' : current))

        void submitChat(userMessage.content, {
            requestId,
            retry: true,
        })
    }, [isTyping, messages, submitChat]);

    const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';

    // 自动滚动到底部
    useEffect(() => {
        if (messages.length > 0 && shouldAutoScroll) {
            scrollRef.current?.scrollToIndex(messages.length - 1, { align: 'end' });
        }
    }, [messages.length, lastMessageContent, shouldAutoScroll]);

    const handleScroll = useRef(
        throttle((offset: number, vlist: VListHandle | null, setAutoScroll: (v: boolean) => void) => {
            if (!vlist) return;
            const isAtBottom = offset + vlist.viewportSize >= vlist.scrollSize - 20;
            setAutoScroll(isAtBottom);
        }, 100)
    ).current;

    const onScroll = useCallback((offset: number) => {
        handleScroll(offset, scrollRef.current, setShouldAutoScroll);
    }, [handleScroll]);

    const handleSend = useCallback(async () => {
        const rawInput = input
        // 校验不通过时既不发送也不清空输入
        if (!rawInput.trim() || isTyping || !conversationId) {
            return
        }

        // 发送即清空输入框（高度由 input 变化的副作用自动收起）
        setInput('')

        const didSend = await submitChat(rawInput)
        // 仅在发送失败或被终止时恢复文字；若用户已在空框中输入新内容则不覆盖
        if (!didSend) {
            setInput((current) => (current === '' ? rawInput : current))
        }
    }, [conversationId, input, isTyping, submitChat]);

    // 选中文件自动加入上下文
    useEffect(() => {
        if (selectedFileName && !contextFiles.includes(selectedFileName)) {
            setContextFiles([...contextFiles, selectedFileName]);
        }
    }, [contextFiles, selectedFileName, setContextFiles]);

    // textarea 高度自适应
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [input]);

    return (
        <div className={styles.chatLayout}>
            {showChangesPanel ? (
                <CodeChangesPanel
                    changes={codeChanges}
                    onClose={() => setShowChangesPanel(false)}
                    onApplyChange={handleApplyChange}
                    onRevertChange={handleRevertChange}
                    onClearChanges={handleClearChanges}
                    onApplyAll={handleApplyAll}
                    onRevertAll={handleRevertAll}
                />
            ) : (
                <div className={styles.chatContainer}>
                    <header className={styles.chatHeader}>
                        <h2>AI 助手</h2>
                        <button
                            className={`${styles.changesBtn} ${pendingChangesCount > 0 ? styles.hasChanges : ''}`}
                            onClick={() => {
                                setShowFilePicker(false);
                                setShowChangesPanel(true);
                            }}
                            title="View code changes"
                        >
                            <Layers size={15} />
                            {pendingChangesCount > 0 && (
                                <span className={styles.changesBadge}>{pendingChangesCount}</span>
                            )}
                        </button>
                    </header>

                    <div className={styles.messagesViewport}>
                        <VList
                            ref={scrollRef}
                            className={styles.vlistContainer}
                            onScroll={onScroll}
                        >
                            {messages.map((msg, i) => (
                                <React.Suspense key={msg.id} fallback={<div style={{ height: '60px' }} />}>
                                    <MessageItem
                                        msg={msg}
                                        isTyping={isTyping}
                                        isLast={i === messages.length - 1}
                                        retryDisabled={isTyping}
                                        onRetry={handleRetry}
                                    />
                                </React.Suspense>
                            ))}
                        </VList>
                    </div>

                    <div className={styles.inputArea}>
                        <div className={styles.contextBar}>
                            {contextFiles.slice(0, 3).map(name => (
                                <div key={name} className={styles.contextChip}>
                                    <FileCode size={12} />
                                    <span className={styles.fileName}>{name}</span>
                                    <button
                                        className={styles.removeBtn}
                                        onClick={() => setContextFiles(contextFiles.filter(f => f !== name))}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {contextFiles.length > 3 && (
                                <span className={styles.moreCount}>+{contextFiles.length - 3}</span>
                            )}

                            <div className={styles.filePickerContainer} ref={pickerRef}>
                                <button className={styles.addContextBtn} onClick={() => setShowFilePicker(!showFilePicker)}>
                                    <Plus size={14} /> Context
                                </button>
                                {showFilePicker && pickerPos && createPortal(
                                    <div
                                        ref={dropdownRef}
                                        className={styles.filePickerDropdown}
                                        style={{ left: pickerPos.left, bottom: pickerPos.bottom }}
                                    >
                                        <div className={styles.dropdownHeader}>Select files as context</div>
                                        {Object.keys(files).map(name => {
                                            const selected = contextFiles.includes(name);
                                            return (
                                                <div
                                                    key={name}
                                                    className={`${styles.dropdownItem} ${selected ? styles.selected : ''}`}
                                                    onClick={() => {
                                                        setContextFiles(
                                                            selected
                                                                ? contextFiles.filter(f => f !== name)
                                                                : [...contextFiles, name]
                                                        );
                                                    }}
                                                >
                                                    <FileCode size={14} />
                                                    <span>{name}</span>
                                                    {selected && <Check size={14} className={styles.checkIcon} />}
                                                </div>
                                            );
                                        })}
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>

                        <div className={styles.inputWrapper}>
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        void handleSend()
                                    }
                                }}
                                placeholder={conversationId ? "Ask me about the code..." : "Initializing conversation..."}
                                rows={1}
                            />
                            <div className={styles.buttonGroup}>
                                {isTyping ? (
                                    <button onClick={() => abortControllerRef.current?.abort()} className={`${styles.actionButton} ${styles.stopBtn}`}>
                                        <Square size={16} fill="currentColor" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => void handleSend()}
                                        disabled={!conversationId || !input.trim()}
                                        className={`${styles.actionButton} ${styles.sendBtn}`}
                                    >
                                        <Send size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIChat;
