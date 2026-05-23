/**
 * @file src/ReactAiPlayground/components/ChatComponent/index.tsx
 * @description AI 聊天组件
 * 负责流式对话、上下文文件拼装和代码变更提取面板联动
 * @author React AI Playground
 */

import { useState, useRef, useEffect, useContext, useCallback } from 'react';
import React from 'react';
import { VList, type VListHandle } from 'virtua';
import { throttle } from 'lodash-es';
import { FileCode, Layers, Plus, Send, Square, X } from 'lucide-react';

import { useChatStore } from '@/store/chatStore';
import {
    AIPlaygroundContext,
    type ConversationWorkspace,
} from '@/ReactAiPlayground/AIPlaygroundContext';
import { useFilePicker } from './hooks/useFilePicker';
import { useChatStream } from './hooks/useChatStream';
import { useCodeChanges } from './hooks/useCodeChanges';
import { useFixCompilerError } from './hooks/useFixCompilerError';

import styles from './index.module.scss';

const CodeChangesPanel = React.lazy(() => import('./CodeChangesPanel'));
const MessageItem = React.lazy(() => import('./MessageItem'));

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

    const {
        files,
        selectedFileName,
        contextFiles,
        setContextFiles,
        updateFileValue,
        removeFile,
        writeFile,
    } = useContext(AIPlaygroundContext);

    const [input, setInput] = useState('');
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

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
    } = useCodeChanges({
        messages,
        isTyping,
        files,
        writeFile,
        removeFile,
        updateFileValue,
    });

    const { showFilePicker, setShowFilePicker, pickerRef } = useFilePicker();

    useFixCompilerError(submitChat);

    const handleRetry = useCallback((requestId: string) => {
        const userMessage = messages.find(
            (message) => message.role === 'user' && message.requestId === requestId
        )

        if (!userMessage?.content || isTyping) {
            return
        }

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
        const nextInput = input
        const didSend = await submitChat(nextInput)
        if (!didSend) {
            return
        }

        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [input, submitChat]);

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
                        <h2>AI Assistant</h2>
                        <button
                            className={`${styles.changesBtn} ${pendingChangesCount > 0 ? styles.hasChanges : ''}`}
                            onClick={() => {
                                setShowFilePicker(false);
                                setShowChangesPanel(true);
                            }}
                            title="View code changes"
                        >
                            <Layers size={18} />
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
                            {contextFiles.map(name => (
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

                            <div className={styles.filePickerContainer} ref={pickerRef}>
                                <button className={styles.addContextBtn} onClick={() => setShowFilePicker(!showFilePicker)}>
                                    <Plus size={14} /> Context
                                </button>
                                {showFilePicker && (
                                    <div className={styles.filePickerDropdown}>
                                        <div className={styles.dropdownHeader}>Select files as context</div>
                                        {Object.keys(files).map(name => (
                                            <div
                                                key={name}
                                                className={`${styles.dropdownItem} ${contextFiles.includes(name) ? styles.selected : ''}`}
                                                onClick={() => {
                                                    if (!contextFiles.includes(name)) {
                                                        setContextFiles([...contextFiles, name]);
                                                    }
                                                    setShowFilePicker(false);
                                                }}
                                            >
                                                <FileCode size={14} />
                                                <span>{name}</span>
                                            </div>
                                        ))}
                                    </div>
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
