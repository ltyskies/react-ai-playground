/**
 * @file src/store/chatStore.tsx
 * @description 聊天状态管理模块
 * 统一维护会话消息、流式输出状态和请求级别的重试信息
 * @author React AI Playground
 */

import { create } from 'zustand';
import { produce } from 'immer';
import type { StreamStatus } from '@/apis/chat';

/**
 * 聊天消息接口
 * @description 定义聊天对话中的单条消息数据结构，包含展示、流式状态和错误信息
 */
export interface Message {
    id: string | number;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    requestId?: string;
    status: StreamStatus;
    retryable?: boolean;
    errorMessage?: string;
}

/**
 * 待刷新内容缓存
 * @description 流式输出时暂存最新内容，等定时器触发时批量同步到消息列表
 */
interface PendingContentState {
    requestId: string | null;
    content: string;
}

/**
 * 消息状态补丁选项
 */
interface MessagePatchOptions {
    retryable?: boolean;
    errorMessage?: string;
}

type AddMessagePayload = Omit<Message, 'id' | 'timestamp'> & Partial<Pick<Message, 'id' | 'timestamp'>>;

/**
 * 聊天状态接口
 * @description 定义聊天模块的完整 Zustand store 结构与操作方法
 */
interface ChatState {
    /** 当前活跃会话 ID */
    conversationId: number | null;
    /** 消息列表 */
    messages: Message[];
    /** 是否正在生成回复 */
    isTyping: boolean;
    /** 当前活跃的请求 ID（用于流式请求追踪） */
    activeRequestId: string | null;
    /** 流式输出暂存内容 */
    pendingContent: PendingContentState;
    /** 当前请求的中断控制器 */
    abortController: AbortController | null;
    setConversationId: (id: number | null) => void;
    setMessages: (messages: Message[]) => void;
    replaceConversation: (payload: {
        conversationId: number | null;
        messages: Message[];
    }) => void;
    addMessage: (msg: AddMessagePayload) => void;
    updateAssistantMessage: (requestId: string, content: string) => void;
    flushPendingContent: () => void;
    setRequestStatus: (
        requestId: string,
        status: StreamStatus,
        options?: MessagePatchOptions
    ) => void;
    prepareRequestRetry: (requestId: string) => void;
    setIsTyping: (status: boolean) => void;
    setActiveRequestId: (requestId: string | null) => void;
    clearMessages: () => void;
    setAbortController: (controller: AbortController | null) => void;
    abortCurrentRequest: () => void;
}

/** 消息默认流式状态 */
const DEFAULT_STATUS: StreamStatus = 'completed'

/** 生成唯一消息 ID，格式为时间戳加随机后缀 */
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** 补齐消息缺失字段，确保每条消息都有完整的默认值 */
const normalizeMessage = (message: AddMessagePayload): Message => ({
    id: message.id ?? generateId(),
    role: message.role,
    content: message.content,
    timestamp: message.timestamp ?? Date.now(),
    requestId: message.requestId,
    status: message.status ?? DEFAULT_STATUS,
    retryable: message.retryable ?? false,
    errorMessage: message.errorMessage,
})

/** 按 requestId 批量更新消息列表中的匹配项 */
const patchRequestMessages = (
    messages: Message[],
    requestId: string,
    updater: (message: Message) => Message
) => messages.map((message) => (
    message.requestId === requestId
        ? updater(message)
        : message
))

/** 按 requestId 仅更新助手角色的消息 */
const patchAssistantMessageByRequestId = (
    messages: Message[],
    requestId: string,
    updater: (message: Message) => Message
) => messages.map((message) => (
    message.role === 'assistant' && message.requestId === requestId
        ? updater(message)
        : message
))

// 流式输出阶段先把最新内容缓存在 store 中，再按节流频率落到消息列表里，
// 可以减少频繁 setState 带来的重渲染抖动。
const applyPendingContent = (state: ChatState) => {
    const { pendingContent } = state
    if (!pendingContent.content || !pendingContent.requestId) {
        state.pendingContent = { requestId: null, content: '' }
        return
    }

    state.messages = patchAssistantMessageByRequestId(
        state.messages,
        pendingContent.requestId,
        (message) => ({
            ...message,
            content: pendingContent.content,
        })
    )
    state.pendingContent = { requestId: null, content: '' }
}

export const useChatStore = create<ChatState>()(
    (set, get) => {
        let updateTimer: ReturnType<typeof setTimeout> | null = null;

        return {
            conversationId: null,
            messages: [],
            isTyping: false,
            activeRequestId: null,
            pendingContent: { requestId: null, content: '' },
            abortController: null,

            setConversationId: (id) => set({ conversationId: id }),

            setMessages: (messages) => set({ messages: messages.map(normalizeMessage) }),

            replaceConversation: ({ conversationId, messages }) => set({
                conversationId,
                messages: messages.map(normalizeMessage),
                isTyping: false,
                activeRequestId: null,
                pendingContent: { requestId: null, content: '' },
                abortController: null,
            }),

            setIsTyping: (status) => set({ isTyping: status }),
            setActiveRequestId: (requestId) => set({ activeRequestId: requestId }),

            addMessage: (msg) =>
                set(produce((state: ChatState) => {
                    state.messages.push(normalizeMessage(msg));
                })),

            updateAssistantMessage: (requestId, content) => {
                if (updateTimer) {
                    clearTimeout(updateTimer);
                }

                // 先缓存本次流式内容，等定时器触发时再批量同步到消息列表。
                set({
                    pendingContent: {
                        requestId,
                        content,
                    }
                });

                updateTimer = setTimeout(() => {
                    set(produce((state: ChatState) => {
                        applyPendingContent(state)
                    }));
                    updateTimer = null;
                }, 50);
            },

            flushPendingContent: () => {
                if (updateTimer) {
                    clearTimeout(updateTimer);
                    updateTimer = null;
                }

                set(produce((state: ChatState) => {
                    applyPendingContent(state)
                }));
            },

            setRequestStatus: (requestId, status, options) => {
                set(produce((state: ChatState) => {
                    state.messages = patchRequestMessages(
                        state.messages,
                        requestId,
                        (message) => ({
                            ...message,
                            status,
                            retryable: message.role === 'assistant'
                                ? options?.retryable ?? false
                                : false,
                            errorMessage: message.role === 'assistant'
                                ? options?.errorMessage
                                : undefined,
                        })
                    )
                }));
            },

            prepareRequestRetry: (requestId) => {
                set(produce((state: ChatState) => {
                    state.messages = patchRequestMessages(
                        state.messages,
                        requestId,
                        (message) => ({
                            ...message,
                            content: message.role === 'assistant' ? '' : message.content,
                            status: 'pending',
                            retryable: false,
                            errorMessage: undefined,
                        })
                    )

                    if (state.pendingContent.requestId === requestId) {
                        state.pendingContent = { requestId: null, content: '' }
                    }
                }));
            },

            clearMessages: () => set({
                messages: [],
                pendingContent: { requestId: null, content: '' },
                isTyping: false,
                activeRequestId: null,
            }),

            setAbortController: (controller) => set({ abortController: controller }),

            abortCurrentRequest: () => {
                const controller = get().abortController;
                controller?.abort();

                if (updateTimer) {
                    clearTimeout(updateTimer);
                    updateTimer = null;
                }

                set({
                    abortController: null,
                    isTyping: false,
                    activeRequestId: null,
                    pendingContent: { requestId: null, content: '' },
                });
            },
        };
    }
);
