/**
 * @file src/ReactAiPlayground/components/ChatComponent/hooks/useChatStream.ts
 * @description 流式聊天请求 hook
 * 管理 fetch + SSE 流读取 + 空闲超时 + 错误处理的完整生命周期
 * @author React AI Playground
 */

import { useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { getToken } from '@/utils/token';
import { apiBaseUrl, handleUnauthorized } from '@/utils/request';
import type { StreamStatus } from '@/apis/chat';
import type { ConversationWorkspace } from '@/ReactAiPlayground/AIPlaygroundContext';
import {
    createRequestId,
    parseSseEvent,
    STREAM_IDLE_TIMEOUT_MS,
    EVENT_STREAM_CONTENT_TYPE,
    type StreamErrorPayload,
} from '@/ReactAiPlayground/components/ChatComponent/utils/sseParser';

/** 提交聊天的附加选项 */
export interface SubmitChatOptions {
    requestId?: string
    retry?: boolean
}

/** 请求失败的统一描述结构 */
export interface RequestFailure {
    status: Exclude<StreamStatus, 'completed'>
    retryable: boolean
    message: string
    reason: string
}

/**
 * 聊天请求错误类
 * @description 包装流式聊天请求中的各类错误，附带状态和可重试标记
 */
export class ChatRequestError extends Error {
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

interface UseChatStreamOptions {
    getWorkspace: () => ConversationWorkspace
    onBeforeSend?: () => Promise<void> | void
    onConversationUpdated?: () => Promise<void> | void
}

export const useChatStream = ({
    getWorkspace,
    onBeforeSend,
    onConversationUpdated,
}: UseChatStreamOptions) => {
    const {
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

    const abortControllerRef = useRef<AbortController | null>(null);

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

        const token = getToken();
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
                    workspace: getWorkspace(),
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
        updateAssistantMessage,
        getWorkspace,
    ]);

    return { submitChat, abortControllerRef };
};
