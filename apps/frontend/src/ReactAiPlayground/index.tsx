/**
 * @file src/ReactAiPlayground/index.tsx
 * @description React AI Playground 主页面组件
 * @author React AI Playground
 */

import { Allotment } from "allotment";
import "allotment/dist/style.css";
import "./index.scss";

import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import { useNavigate } from "react-router";

import Header from "./components/Header";
import {
    AIPlaygroundContext,
    createTemplateWorkspace,
    getWorkspaceFromUrl,
    type ConversationWorkspace,
} from "./AIPlaygroundContext";
import {
    createNewConversationAPI,
    getConversationDetailAPI,
    saveConversationWorkspaceAPI,
    type ConversationDetail,
    type ConversationMessage,
    type StreamStatus,
} from "@/apis/chat";
import { useChatStore, type Message as ChatMessage } from "@/store/chatStore";

import CodeEditorSkeleton from "./components/Skeleton/CodeEditorSkeleton";
import PreviewSkeleton from "./components/Skeleton/PreviewSkeleton";
import ChatSkeleton from "./components/Skeleton/ChatSkeleton";

const CodeEditor = lazy(() => import("./components/CodeEditor"));
const Preview = lazy(() => import("./components/Preview"));
const ChatComponent = lazy(() => import("./components/ChatComponent"));

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
    const {
        isShow,
        files,
        selectedFileName,
        contextFiles,
        hydrateWorkspace,
    } = useContext(AIPlaygroundContext);

    const {
        conversationId,
        replaceConversation,
        abortCurrentRequest,
    } = useChatStore();

    const [conversationActionLoading, setConversationActionLoading] = useState(false);

    const suspendAutoSaveRef = useRef(false);
    const initializedRef = useRef(false);
    const initialUrlWorkspaceRef = useRef<ConversationWorkspace | undefined>(getWorkspaceFromUrl());
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
        if (initializedRef.current) {
            return;
        }

        initializedRef.current = true;

        const initializeConversation = async () => {
            setConversationActionLoading(true);

            try {
                if (initialConversationIdRef.current) {
                    try {
                        await loadConversationDetail(initialConversationIdRef.current);
                        return;
                    } catch (error) {
                        console.error("Failed to load conversation from url:", error);
                        clearConversationIdFromUrl();
                    }
                }

                const initialWorkspace = initialUrlWorkspaceRef.current || createTemplateWorkspace();
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
                    <Allotment.Pane minSize={200}>
                        <Suspense fallback={<CodeEditorSkeleton />}>
                            <CodeEditor />
                        </Suspense>
                    </Allotment.Pane>

                    <Allotment.Pane minSize={200}>
                        <Suspense fallback={<PreviewSkeleton />}>
                            <Preview />
                        </Suspense>
                    </Allotment.Pane>

                    {isShow && (
                        <Allotment.Pane preferredSize={400} minSize={100}>
                            <Suspense fallback={<ChatSkeleton />}>
                                <ChatComponent
                                    key={conversationId ?? 'conversation-pending'}
                                    onBeforeSend={flushWorkspaceSave}
                                />
                            </Suspense>
                        </Allotment.Pane>
                    )}
                </Allotment>
            </div>
        </div>
    );
}
