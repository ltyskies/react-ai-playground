/**
 * @file src/ReactAiPlayground/components/ChatComponent/hooks/useChatStream.ts
 * @description 流式聊天请求 hook
 * 管理 fetch + SSE 流读取 + 空闲超时 + 错误处理的完整生命周期
 * @author React AI Playground
 */

import { useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useCodeChangesStore } from '@/store/codeChangesStore';
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

/** 结构化流事件的统一载荷（不同事件使用其中的部分字段） */
interface StreamEventPayload {
    content?: string
    fileName?: string
    language?: string
    isNewFile?: boolean
    oldValue?: string
    line?: string
    index?: number
    status?: 'done'
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

                let payload: StreamEventPayload;
                try {
                    payload = JSON.parse(parsedEvent.data) as StreamEventPayload;
                } catch (error) {
                    console.error('Failed to parse SSE payload.', error, parsedEvent.data);
                    throw new ChatRequestError('流式响应内容格式无效。', {
                        status: 'failed',
                        retryable: true,
                        reason: 'invalid_content_event',
                    });
                }

                const codeStore = useCodeChangesStore.getState();

                switch (parsedEvent.event) {
                    // 思考/说明文本：累加展示到聊天气泡
                    case 'thinking': {
                        if (typeof payload.content !== 'string') {
                            break;
                        }
                        streamedContent += payload.content;
                        updateAssistantMessage(requestId, streamedContent);
                        break;
                    }
                    // 收到传代码信号：跳转代码区、擦除/新建文件
                    case 'file_start': {
                        if (payload.fileName) {
                            codeStore.beginFileStream(requestId, {
                                fileName: payload.fileName,
                                language: payload.language ?? '',
                                isNewFile: !!payload.isNewFile,
                                oldValue: payload.oldValue ?? '',
                            });
                        }
                        break;
                    }
                    // 逐行追加代码到文件
                    case 'code': {
                        if (payload.fileName && typeof payload.line === 'string') {
                            codeStore.appendFileLine(payload.fileName, payload.line);
                        }
                        break;
                    }
                    // 文件结束：用权威内容覆盖
                    case 'file_end': {
                        if (payload.fileName) {
                            codeStore.finishFileStream(payload.fileName, payload.content ?? '');
                        }
                        break;
                    }
                    // 兜底：未命名事件但带 content，按思考文本处理
                    default: {
                        if (typeof payload.content === 'string') {
                            streamedContent += payload.content;
                            updateAssistantMessage(requestId, streamedContent);
                        }
                    }
                }

                resetIdleTimer()
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

            useCodeChangesStore.getState().rollbackStreamingGroup(requestId)
            setRequestStatus(requestId, failure.status, {
                retryable: failure.retryable,
                errorMessage: failure.message,
            })
            return false
        } finally {
            clearIdleTimer()
            setIsTyping(false);
            setActiveRequestId(null);
            abortControllerRef.current = null;
            setAbortController(null);
            await onConversationUpdated?.();
        }
    }, [
        addMessage,
        conversationId,
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
