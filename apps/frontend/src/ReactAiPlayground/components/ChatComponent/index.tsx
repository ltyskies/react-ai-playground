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

import router from '@/router';
import { useChatStore } from '@/store/chatStore';
import {
    AIPlaygroundContext,
    type ConversationWorkspace,
    type Files,
} from '@/ReactAiPlayground/AIPlaygroundContext';
import { getToken, removeToken } from '@/utils/token';
import { apiBaseUrl } from '@/utils/request';
import type { StreamStatus } from '@/apis/chat';
import type { CodeChange } from './CodeChangesPanel';
import { extractAutoApplicableCodeBlocks } from './codeBlockUtils';

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

/** SSE 解析后的单条事件 */
interface ParsedSseEvent {
    event: string
    data: string
}

/** 服务端流错误事件的载荷格式 */
interface StreamErrorPayload {
    message?: string
    retryable?: boolean
    reason?: string
}

/** 提交聊天的附加选项 */
interface SubmitChatOptions {
    requestId?: string
    retry?: boolean
}

/** 请求失败的统一描述结构 */
interface RequestFailure {
    status: Exclude<StreamStatus, 'completed'>
    retryable: boolean
    message: string
    reason: string
}

/**
 * 聊天请求错误类
 * @description 包装流式聊天请求中的各类错误，附带状态和可重试标记
 */
class ChatRequestError extends Error {
    status: Exclude<StreamStatus, 'completed'>
    retryable: boolean
    reason: string

    constructor(
        message: string,
        options: {
            status: Exclude<StreamStatus, 'completed'>
            retryable: boolean
            reason: string
        }
    ) {
        super(message)
        this.name = 'ChatRequestError'
        this.status = options.status
        this.retryable = options.retryable
        this.reason = options.reason
    }
}

/** 流式响应空闲超时阈值，超过该时间无新分片则主动中断 */
const STREAM_IDLE_TIMEOUT_MS = 30_000
/** SSE 流响应 Content-Type */
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream'

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

/** 生成唯一请求 ID，格式为时间戳加随机后缀 */
const createRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** 提取 SSE 行中前缀之后的值部分 */
const getSseLineValue = (line: string, prefix: string) => {
    return line.slice(prefix.length).trimStart();
};

// 前端按 event/data 行手动解析 SSE 事件，兼容服务端分片输出。
const parseSseEvent = (rawEvent: string): ParsedSseEvent | null => {
    const lines = rawEvent.replace(/\r/g, '').split('\n');
    const dataLines: string[] = [];
    let event = 'message';

    for (const line of lines) {
        if (!line || line.startsWith(':')) {
            continue;
        }

        if (line.startsWith('event:')) {
            event = getSseLineValue(line, 'event:');
            continue;
        }

        if (line.startsWith('data:')) {
            dataLines.push(getSseLineValue(line, 'data:'));
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    return {
        event,
        data: dataLines.join('\n'),
    };
};

/** 判断 HTTP 状态码是否可重试（超时、限流或服务端错误） */
const isRetryableHttpStatus = (status: number) => {
    return status === 408 || status === 429 || status >= 500
}

/** 判断响应是否为 SSE 流 */
const isEventStreamResponse = (response: Response) => {
    const contentType = response.headers.get('content-type') || ''
    return contentType.toLowerCase().includes(EVENT_STREAM_CONTENT_TYPE)
}

/** 从非成功 HTTP 响应中提取可读的错误消息 */
const getResponseErrorMessage = async (response: Response) => {
    const fallback = response.statusText
        ? `Request failed (HTTP ${response.status} ${response.statusText})`
        : `Request failed (HTTP ${response.status})`;

    try {
        const text = await response.text();
        if (!text) {
            return fallback;
        }

        try {
            const parsed = JSON.parse(text) as { message?: string | string[] };
            if (typeof parsed.message === 'string' && parsed.message.trim()) {
                return parsed.message;
            }

            if (Array.isArray(parsed.message)) {
                const normalizedMessage = parsed.message
                    .filter((item) => typeof item === 'string' && item.trim())
                    .join(', ')

                if (normalizedMessage) {
                    return normalizedMessage
                }
            }
        } catch {
            // ignore non-json error payloads
        }

        return text;
    } catch {
        return fallback;
    }
};

/** 401 未授权统一处理：清除 Token、跳转登录并刷新页面 */
const handleUnauthorized = () => {
    removeToken()
    router.navigate('/login')
    window.location.reload()
}

/** 根据中断原因返回面向用户的提示文案 */
const getInterruptedMessage = (reason: string) => {
    if (reason === 'stream_timeout') {
        return '连接长时间无响应，可重试。'
    }

    if (reason === 'aborted') {
        return '已停止生成，可重试。'
    }

    return '连接已中断，可重试。'
}

/** 将各类异常统一归并为 RequestFailure 结构，方便上游统一处理 */
const normalizeRequestFailure = (
    error: unknown,
    abortReason?: string | null
): RequestFailure => {
    if (error instanceof ChatRequestError) {
        return {
            status: error.status,
            retryable: error.retryable,
            message: error.message,
            reason: error.reason,
        }
    }

    if (error instanceof Error && error.name === 'AbortError') {
        const normalizedReason = abortReason === 'stream_timeout'
            ? 'stream_timeout'
            : 'aborted'

        return {
            status: 'interrupted',
            retryable: true,
            message: getInterruptedMessage(normalizedReason),
            reason: normalizedReason,
        }
    }

    return {
        status: 'failed',
        retryable: true,
        message: error instanceof Error
            ? error.message
            : '未能接收到有效的流式响应。',
        reason: 'unknown_error',
    }
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
        addMessage,
        updateAssistantMessage,
        flushPendingContent,
        setRequestStatus,
        prepareRequestRetry,
        setIsTyping,
        setActiveRequestId,
        setAbortController,
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
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [codeChanges, setCodeChanges] = useState<CodeChange[]>([]);
    const [showChangesPanel, setShowChangesPanel] = useState(false);

    const scrollRef = useRef<VListHandle>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const previousIsTypingRef = useRef(isTyping);

    const token = getToken();

    const workspace = useCallback((): ConversationWorkspace => ({
        files,
        selectedFileName,
        contextFiles,
    }), [contextFiles, files, selectedFileName]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowFilePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /** 提交聊天消息并处理流式响应，支持新消息和重试两种模式 */
    const submitChat = useCallback(async (text: string, options?: SubmitChatOptions) => {
        const normalizedText = text.trim()
        if (!normalizedText || isTyping || !conversationId) {
            return false
        }

        try {
            await onBeforeSend?.();
        } catch (error) {
            console.error('Failed before sending chat message.', error);
            return false
        }

        const requestId = options?.requestId || createRequestId()
        if (options?.retry) {
            prepareRequestRetry(requestId)
        } else {
            addMessage({
                role: 'user',
                content: normalizedText,
                requestId,
                status: 'pending',
            });
            addMessage({
                role: 'assistant',
                content: '',
                requestId,
                status: 'pending',
            });
        }

        setIsTyping(true);
        setActiveRequestId(requestId);
        setShouldAutoScroll(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;
        setAbortController(controller);
        let idleTimer: ReturnType<typeof setTimeout> | null = null
        let abortReason: string | null = null

        const clearIdleTimer = () => {
            if (idleTimer) {
                clearTimeout(idleTimer)
                idleTimer = null
            }
        }

        // 流式读取长时间无新分片时主动中断，避免界面一直卡在“生成中”。
        const resetIdleTimer = () => {
            clearIdleTimer()
            idleTimer = setTimeout(() => {
                if (controller.signal.aborted) {
                    return
                }

                abortReason = 'stream_timeout'
                controller.abort()
            }, STREAM_IDLE_TIMEOUT_MS)
        }

        try {
            const response = await fetch(`${apiBaseUrl}/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    conversationId,
                    message: normalizedText,
                    workspace: workspace(),
                    requestId,
                }),
                signal: controller.signal,
            });

            if (response.status === 401) {
                handleUnauthorized()
                throw new ChatRequestError('登录已失效，请重新登录。', {
                    status: 'failed',
                    retryable: false,
                    reason: 'unauthorized',
                })
            }

            if (!response.ok) {
                throw new ChatRequestError(await getResponseErrorMessage(response), {
                    status: 'failed',
                    retryable: isRetryableHttpStatus(response.status),
                    reason: `http_${response.status}`,
                })
            }

            if (!isEventStreamResponse(response)) {
                throw new ChatRequestError('服务端返回了非流式响应，请重试。', {
                    status: 'failed',
                    retryable: true,
                    reason: 'invalid_content_type',
                })
            }

            if (!response.body) {
                throw new ChatRequestError('未收到流式响应内容，请重试。', {
                    status: 'failed',
                    retryable: true,
                    reason: 'missing_body',
                })
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let streamedContent = '';
            let buffer = '';
            let isDone = false;

            resetIdleTimer()

            const processEvent = (rawEvent: string) => {
                const parsedEvent = parseSseEvent(rawEvent);
                if (!parsedEvent) {
                    return;
                }

                if (parsedEvent.data === '[DONE]') {
                    isDone = true;
                    clearIdleTimer()
                    return;
                }

                if (parsedEvent.event === 'error') {
                    try {
                        const parsed = JSON.parse(parsedEvent.data) as StreamErrorPayload;
                        throw new ChatRequestError(
                            parsed.message || '服务端处理失败，请稍后重试。',
                            {
                                status: 'failed',
                                retryable: parsed.retryable ?? true,
                                reason: parsed.reason || 'stream_error',
                            }
                        );
                    } catch (error) {
                        if (error instanceof ChatRequestError) {
                            throw error;
                        }

                        console.error('Failed to parse SSE error event.', error, parsedEvent.data);
                        throw new ChatRequestError('服务端错误事件格式无效。', {
                            status: 'failed',
                            retryable: true,
                            reason: 'invalid_error_event',
                        });
                    }
                }

                try {
                    const parsed = JSON.parse(parsedEvent.data) as { content?: string };
                    if (typeof parsed.content !== 'string') {
                        throw new ChatRequestError(
                            '流式响应内容格式无效。',
                            {
                                status: 'failed',
                                retryable: true,
                                reason: 'invalid_content_event',
                            }
                        );
                    }

                    streamedContent += parsed.content;
                    updateAssistantMessage(requestId, streamedContent);
                    resetIdleTimer()
                } catch (error) {
                    if (error instanceof ChatRequestError) {
                        throw error;
                    }

                    console.error('Failed to parse SSE content event.', error, parsedEvent.data);
                    throw new ChatRequestError('流式响应内容格式无效。', {
                        status: 'failed',
                        retryable: true,
                        reason: 'invalid_content_event',
                    });
                }
            };

            const processBuffer = () => {
                // SSE 事件之间以空行分隔，缓冲区里可能一次读到多个事件。
                buffer = buffer.replace(/\r\n/g, '\n');
                let separatorIndex = buffer.indexOf('\n\n');

                while (separatorIndex !== -1) {
                    const rawEvent = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    processEvent(rawEvent);

                    if (isDone) {
                        return;
                    }

                    separatorIndex = buffer.indexOf('\n\n');
                }
            };

            while (!isDone) {
                const { value, done } = await reader.read();
                if (done) {
                    buffer += decoder.decode();
                    processBuffer();

                    if (!isDone && buffer.trim()) {
                        processEvent(buffer);
                        buffer = '';
                    }

                    if (!isDone) {
                        throw new ChatRequestError('流式响应在完成前中断，可重试。', {
                            status: 'interrupted',
                            retryable: true,
                            reason: 'unexpected_eof',
                        })
                    }

                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                resetIdleTimer()
                processBuffer();
            }

            flushPendingContent()
            setRequestStatus(requestId, 'completed')
            return true
        } catch (error: unknown) {
            const failure = normalizeRequestFailure(
                error,
                abortReason ?? (controller.signal.aborted ? 'aborted' : null)
            )
            if (!(error instanceof Error && error.name === 'AbortError')) {
                console.error(error);
            }

            setRequestStatus(requestId, failure.status, {
                retryable: failure.retryable,
                errorMessage: failure.message,
            })
            return false
        } finally {
            clearIdleTimer()
            flushPendingContent();
            setIsTyping(false);
            setActiveRequestId(null);
            abortControllerRef.current = null;
            setAbortController(null);
            await onConversationUpdated?.();
        }
    }, [
        addMessage,
        conversationId,
        flushPendingContent,
        isTyping,
        onBeforeSend,
        onConversationUpdated,
        prepareRequestRetry,
        setAbortController,
        setActiveRequestId,
        setIsTyping,
        setRequestStatus,
        token,
        updateAssistantMessage,
        workspace,
    ]);

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

    const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';
    const lastMessageRole = messages.length > 0 ? messages[messages.length - 1].role : null;
    const lastMessageStatus = messages.length > 0 ? messages[messages.length - 1].status : null;
    const lastMessageRequestId = messages.length > 0 ? messages[messages.length - 1].requestId : undefined;

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

    useEffect(() => {
        const handleFixError = (e: Event) => {
            const customEvent = e as CustomEvent;
            const errorText = customEvent.detail.content;
            // 编译报错修复入口会复用当前上下文文件，直接生成一条追问给聊天接口。
            const prompt = `I ran into the following compiler error. Please fix it using the current file context:\n\n${errorText}`;
            void submitChat(prompt);
        };
        window.addEventListener('fix-compiler-error', handleFixError);
        return () => window.removeEventListener('fix-compiler-error', handleFixError);
    }, [submitChat]);

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

    useEffect(() => {
        if (selectedFileName && !contextFiles.includes(selectedFileName)) {
            setContextFiles([...contextFiles, selectedFileName]);
        }
    }, [contextFiles, selectedFileName, setContextFiles]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [input]);

    const pendingChangesCount = codeChanges.filter(c => !c.applied).length;

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
