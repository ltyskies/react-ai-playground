/**
 * @file src/ReactAiPlayground/index.tsx
 * @description React AI Playground 主页面组件
 * @author React AI Playground
 */

import { Allotment } from "allotment";
import "allotment/dist/style.css";
import "@/ReactAiPlayground/index.scss";
import layoutStyles from "@/ReactAiPlayground/layout.module.scss";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import { useNavigate } from "react-router";

import Header from "@/ReactAiPlayground/components/Header";
import {
    createTemplateWorkspace,
    type ConversationWorkspace,
} from "@/ReactAiPlayground/AIPlaygroundContext";
import { usePlaygroundStore } from "@/store/playgroundStore";
import {
    createNewConversationAPI,
    getConversationDetailAPI,
    saveConversationWorkspaceAPI,
    type ConversationDetail,
    type ConversationMessage,
    type StreamStatus,
} from "@/apis/chat";
import { useChatStore, type Message as ChatMessage } from "@/store/chatStore";

import CodeEditorSkeleton from "@/ReactAiPlayground/components/Skeleton/CodeEditorSkeleton";
import PreviewSkeleton from "@/ReactAiPlayground/components/Skeleton/PreviewSkeleton";
import ChatSkeleton from "@/ReactAiPlayground/components/Skeleton/ChatSkeleton";

const CodeEditor = lazy(() => import("@/ReactAiPlayground/components/CodeEditor"));
const Preview = lazy(() => import("@/ReactAiPlayground/components/Preview"));
const ChatComponent = lazy(() => import("@/ReactAiPlayground/components/ChatComponent"));

/**
 * 从 URL 查询参数中解析会话 ID
 * @returns 有效会话 ID 或 null
 */
const getConversationIdFromUrl = () => {
    const value = new URLSearchParams(window.location.search).get('conversationId')
    if (!value) {
        return null
    }

    const conversationId = Number(value)
    return Number.isInteger(conversationId) && conversationId > 0
        ? conversationId
        : null
}

/** 移除 URL 中的 conversationId 查询参数，保持地址栏整洁 */
const clearConversationIdFromUrl = () => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('conversationId')) {
        return
    }

    url.searchParams.delete('conversationId')

    const nextSearch = url.searchParams.toString()
    window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
    )
}

/** 根据流式状态返回面向用户的恢复提示文案 */
const getRecoveredStatusMessage = (status: StreamStatus) => {
    if (status === 'failed') {
        return '上次请求失败，可重试。'
    }

    if (status === 'interrupted') {
        return '上次生成已中断，可重试。'
    }

    return '上次请求未完成，可重试。'
}

/** 为未完成的助手消息生成占位入口，方便用户触发重试 */
const createRecoveredAssistantPlaceholder = (
    message: ConversationMessage,
    status: StreamStatus
): ChatMessage => ({
    id: `assistant-recovery-${message.requestId}`,
    role: 'assistant',
    content: '',
    timestamp: new Date(message.createdAt).getTime(),
    requestId: message.requestId || undefined,
    status,
    retryable: true,
    errorMessage: getRecoveredStatusMessage(status),
})

/** 过滤掉系统消息，仅保留 user/assistant 角色消息供 UI 展示 */
const isVisibleConversationMessage = (
    message: ConversationMessage
): message is ConversationMessage & { role: 'user' | 'assistant' } => (
    message.role === 'user' || message.role === 'assistant'
)

/** 将会话详情中的原始消息转换为 ChatStore 消息格式，并对未完成轮次补占位消息 */
const mapConversationMessages = (messages: ConversationMessage[]) => {
    const visibleMessages = messages.filter(isVisibleConversationMessage)
    const completedAssistantRequestIds = new Set(
        visibleMessages
            .filter(
                (message) =>
                    message.role === 'assistant' &&
                    message.requestId &&
                    message.status === 'completed'
            )
            .map((message) => message.requestId as string)
    )

    return visibleMessages.reduce<ChatMessage[]>((result, message) => {
        const status = message.status || 'completed'

        result.push({
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.createdAt).getTime(),
            requestId: message.requestId || undefined,
            status,
            retryable: false,
        })

        if (
            message.role === 'user' &&
            message.requestId &&
            status !== 'completed' &&
            !completedAssistantRequestIds.has(message.requestId)
        ) {
            result.push(createRecoveredAssistantPlaceholder(message, status))
        }

        return result
    }, [])
}

export default function ReactAiPlayground() {
    const navigate = useNavigate();
    const files = usePlaygroundStore((state) => state.files);
    const selectedFileName = usePlaygroundStore((state) => state.selectedFileName);
    const contextFiles = usePlaygroundStore((state) => state.contextFiles);
    const hydrateWorkspace = usePlaygroundStore((state) => state.hydrateWorkspace);
    const activeTab = usePlaygroundStore((state) => state.activeTab);
    const setActiveTab = usePlaygroundStore((state) => state.setActiveTab);

    const {
        conversationId,
        replaceConversation,
        abortCurrentRequest,
    } = useChatStore();

    const [conversationActionLoading, setConversationActionLoading] = useState(false);

    const suspendAutoSaveRef = useRef(false);
    const initialConversationIdRef = useRef<number | null>(getConversationIdFromUrl());

    const workspace = useMemo<ConversationWorkspace>(() => ({
        files,
        selectedFileName,
        contextFiles,
    }), [files, selectedFileName, contextFiles]);

    const latestWorkspaceRef = useRef(workspace);
    useEffect(() => {
        latestWorkspaceRef.current = workspace;
    }, [workspace]);

    /** 将当前工作区持久化到后端的会话记录 */
    const persistWorkspace = useCallback(async (
        targetConversationId: number,
        targetWorkspace: ConversationWorkspace,
    ) => {
        await saveConversationWorkspaceAPI(targetConversationId, targetWorkspace);
    }, []);

    const debouncedWorkspaceSaveRef = useRef(
        debounce(async (targetConversationId: number, targetWorkspace: ConversationWorkspace) => {
            try {
                await persistWorkspace(targetConversationId, targetWorkspace);
            } catch (error) {
                console.error('Failed to auto save workspace:', error);
            }
        }, 800)
    );

    useEffect(() => {
        return () => {
            debouncedWorkspaceSaveRef.current.cancel();
        };
    }, []);

    const flushWorkspaceSave = useCallback(async () => {
        if (!conversationId) {
            debouncedWorkspaceSaveRef.current.cancel();
            return;
        }

        debouncedWorkspaceSaveRef.current.cancel();

        try {
            await persistWorkspace(conversationId, latestWorkspaceRef.current);
        } catch (error) {
            console.error('Failed to save workspace:', error);
        }
    }, [conversationId, persistWorkspace]);

    useEffect(() => {
        if (!conversationId || suspendAutoSaveRef.current) {
            return;
        }

        debouncedWorkspaceSaveRef.current(conversationId, workspace);
    }, [conversationId, workspace]);

    const createConversationWithWorkspace = useCallback(async (nextWorkspace: ConversationWorkspace) => {
        const res = await createNewConversationAPI();
        const nextConversationId = res.data as number;

        suspendAutoSaveRef.current = true;
        try {
            hydrateWorkspace(nextWorkspace);
            replaceConversation({
                conversationId: nextConversationId,
                messages: [],
            });

            await persistWorkspace(nextConversationId, nextWorkspace);
            return nextConversationId;
        } finally {
            suspendAutoSaveRef.current = false;
        }
    }, [hydrateWorkspace, persistWorkspace, replaceConversation]);

    const loadConversationDetail = useCallback(async (targetConversationId: number) => {
        const res = await getConversationDetailAPI(targetConversationId);
        const detail = res.data as ConversationDetail;
        const nextMessages = mapConversationMessages(detail.messages || []);
        const nextWorkspace = detail.workspaceSnapshot || createTemplateWorkspace();

        suspendAutoSaveRef.current = true;
        try {
            replaceConversation({
                conversationId: targetConversationId,
                messages: nextMessages,
            });
            hydrateWorkspace(nextWorkspace);
        } finally {
            suspendAutoSaveRef.current = false;
        }
    }, [hydrateWorkspace, replaceConversation]);

    useEffect(() => {
        const wasInitialized = usePlaygroundStore.getState().initialized;
        usePlaygroundStore.getState().markInitialized();

        const urlConversationId = initialConversationIdRef.current;

        const initializeConversation = async () => {
            setConversationActionLoading(true);

            try {
                // SPA 内跳转返回同一会话：工作区与消息仍存于全局 store，直接沿用，避免重复初始化清空状态。
                if (
                    wasInitialized
                    && urlConversationId
                    && urlConversationId === useChatStore.getState().conversationId
                ) {
                    return;
                }

                // URL 指定了会话（首次进入或从用户中心切换会话）：加载该会话。
                if (urlConversationId) {
                    try {
                        await loadConversationDetail(urlConversationId);
                        return;
                    } catch (error) {
                        console.error("Failed to load conversation from url:", error);
                        clearConversationIdFromUrl();
                    }
                }

                // 已初始化且未指定其它会话：保留当前工作区与会话，避免切走再回来被重置。
                if (wasInitialized) {
                    return;
                }

                const initialWorkspace = createTemplateWorkspace();
                await createConversationWithWorkspace(initialWorkspace);
            } catch (error) {
                console.error("Failed to create conversation:", error);
            } finally {
                setConversationActionLoading(false);
            }
        };

        void initializeConversation();
    }, [createConversationWithWorkspace, loadConversationDetail]);

    const handleCreateConversation = useCallback(async () => {
        setConversationActionLoading(true);
        abortCurrentRequest();
        await flushWorkspaceSave();

        try {
            const nextWorkspace = createTemplateWorkspace();
            await createConversationWithWorkspace(nextWorkspace);
            clearConversationIdFromUrl();
        } catch (error) {
            console.error('Failed to create conversation:', error);
        } finally {
            setConversationActionLoading(false);
        }
    }, [abortCurrentRequest, createConversationWithWorkspace, flushWorkspaceSave]);

    const handleOpenUserCenter = useCallback(async () => {
        setConversationActionLoading(true);
        abortCurrentRequest();
        await flushWorkspaceSave();

        navigate(
            conversationId
                ? `/user-center?conversationId=${conversationId}`
                : '/user-center'
        );
    }, [abortCurrentRequest, conversationId, flushWorkspaceSave, navigate]);

    return (
        <div className="light" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <Header
                actionLoading={conversationActionLoading}
                onCreateConversation={handleCreateConversation}
                onOpenUserCenter={handleOpenUserCenter}
            />

            <div style={{ flex: 1, position: 'relative' }}>
                <Allotment>
                    <Allotment.Pane preferredSize={420} minSize={300}>
                        <Suspense fallback={<ChatSkeleton />}>
                            <ChatComponent
                                key={conversationId ?? 'conversation-pending'}
                                onBeforeSend={flushWorkspaceSave}
                            />
                        </Suspense>
                    </Allotment.Pane>

                    <Allotment.Pane minSize={320}>
                        <div className={layoutStyles.rightPanel}>
                            <div className={layoutStyles.tabBar}>
                                <button
                                    type="button"
                                    className={layoutStyles.tab}
                                    data-active={activeTab === 'preview'}
                                    onClick={() => setActiveTab('preview')}
                                >
                                    预览
                                </button>
                                <button
                                    type="button"
                                    className={layoutStyles.tab}
                                    data-active={activeTab === 'code'}
                                    onClick={() => setActiveTab('code')}
                                >
                                    代码
                                </button>
                            </div>

                            <div className={layoutStyles.tabContent}>
                                {/* 两个视图都常驻，仅用 display 切换，避免 Worker/编辑器反复重建 */}
                                <div
                                    className={layoutStyles.pane}
                                    style={{ display: activeTab === 'preview' ? 'block' : 'none' }}
                                >
                                    <Suspense fallback={<PreviewSkeleton />}>
                                        <Preview />
                                    </Suspense>
                                </div>
                                <div
                                    className={layoutStyles.pane}
                                    style={{ display: activeTab === 'code' ? 'block' : 'none' }}
                                >
                                    <Suspense fallback={<CodeEditorSkeleton />}>
                                        <CodeEditor />
                                    </Suspense>
                                </div>
                            </div>
                        </div>
                    </Allotment.Pane>
                </Allotment>
            </div>
        </div>
    );
}
