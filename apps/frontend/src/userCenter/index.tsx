/**
 * @file src/userCenter/index.tsx
 * @description 用户中心页面
 * @author React AI Playground
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    ArrowLeftOutlined,
    CloseOutlined,
    DeleteOutlined,
    ReloadOutlined,
    SaveOutlined
} from '@ant-design/icons';
import { Button, Empty, Input, Modal, Spin, message } from 'antd';

import styles from '@/userCenter/index.module.scss';
import {
    deleteConversationAPI,
    getConversationListAPI,
    type ConversationSummary,
} from '@/apis/chat';
import {
    clearPromptRulesAPI,
    getPromptRulesAPI,
    updatePromptRulesAPI,
} from '@/apis/user';

/**
 * 从 URL 查询参数中获取会话 ID
 * @param search - URL 查询字符串
 * @returns 会话 ID 或 null
 */
const getConversationIdFromSearch = (search: string) => {
    const value = new URLSearchParams(search).get('conversationId')
    if (!value) {
        return null
    }

    const conversationId = Number(value)
    return Number.isInteger(conversationId) && conversationId > 0
        ? conversationId
        : null
}

/**
 * 格式化时间字符串
 * @param value - ISO 格式的时间字符串
 * @returns 本地化的日期时间字符串
 */
const formatTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default function UserCenter() {
    const navigate = useNavigate();
    const location = useLocation();
    const activeConversationId = useMemo(
        () => getConversationIdFromSearch(location.search),
        [location.search]
    );

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [conversationsLoading, setConversationsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [rules, setRules] = useState('');
    const [rulesLoading, setRulesLoading] = useState(true);
    const [rulesSaving, setRulesSaving] = useState(false);

    const loadConversations = useCallback(async () => {
        setConversationsLoading(true);

        try {
            const res = await getConversationListAPI();
            setConversations(res.data || []);
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
            message.error('加载历史会话失败');
        } finally {
            setConversationsLoading(false);
        }
    }, []);

    const loadRules = useCallback(async () => {
        setRulesLoading(true);

        try {
            const res = await getPromptRulesAPI();
            setRules(res.data?.rules || '');
        } catch (error) {
            console.error('Failed to fetch prompt rules:', error);
            message.error('加载个人 rules 失败');
        } finally {
            setRulesLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadConversations();
        void loadRules();
    }, [loadConversations, loadRules]);

    const handleBack = useCallback(() => {
        navigate(
            activeConversationId
                ? `/index?conversationId=${activeConversationId}`
                : '/index'
        );
    }, [activeConversationId, navigate]);

    const handleSelectConversation = useCallback((conversationId: number) => {
        navigate(`/index?conversationId=${conversationId}`);
    }, [navigate]);

    const handleDeleteConversation = useCallback(async (conversationId: number, event: React.MouseEvent) => {
        event.stopPropagation();

        Modal.confirm({
            title: '确认删除',
            content: '确定要删除这个会话吗？此操作不可恢复。',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                setDeletingId(conversationId);

                try {
                    await deleteConversationAPI(conversationId);
                    message.success('会话已删除');
                    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
                } catch (error) {
                    console.error('Failed to delete conversation:', error);
                    message.error('删除会话失败');
                } finally {
                    setDeletingId(null);
                }
            },
        });
    }, []);

    const handleSaveRules = useCallback(async () => {
        setRulesSaving(true);

        try {
            const res = await updatePromptRulesAPI(rules);
            setRules(res.data?.rules || '');
            message.success('个人 rules 已保存');
        } catch (error) {
            console.error('Failed to save prompt rules:', error);
            message.error('保存个人 rules 失败');
        } finally {
            setRulesSaving(false);
        }
    }, [rules]);

    const handleClearRules = useCallback(async () => {
        setRulesSaving(true);

        try {
            await clearPromptRulesAPI();
            setRules('');
            message.success('个人 rules 已清空');
        } catch (error) {
            console.error('Failed to clear prompt rules:', error);
            message.error('清空个人 rules 失败');
        } finally {
            setRulesSaving(false);
        }
    }, []);

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div>
                    <p className={styles.eyebrow}>User Center</p>
                    <h1>用户中心</h1>
                    <p className={styles.subtitle}>
                        在这里管理历史会话，并维护每次对话都会附带给大模型的个人 rules。
                    </p>
                </div>

                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={handleBack}
                >
                    返回工作台
                </Button>
            </div>

            <div className={styles.content}>
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <div>
                            <h2>历史会话</h2>
                            <p>点击任意历史会话后，将返回主界面并恢复聊天记录与代码状态。</p>
                        </div>

                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => void loadConversations()}
                            loading={conversationsLoading}
                        >
                            刷新
                        </Button>
                    </div>

                    <div className={styles.historyList}>
                        {conversationsLoading ? (
                            <div className={styles.centerState}>
                                <Spin />
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className={styles.centerState}>
                                <Empty description="暂无历史会话" />
                            </div>
                        ) : (
                            conversations.map((conversation) => (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    className={`${styles.historyItem} ${conversation.id === activeConversationId ? styles.activeItem : ''}`}
                                    onClick={() => handleSelectConversation(conversation.id)}
                                >
                                    <div className={styles.historyItemMain}>
                                        <span className={styles.historyTitle}>{conversation.title}</span>
                                        <span className={styles.historyMeta}>
                                            更新于 {formatTime(conversation.updatedAt)}
                                        </span>
                                    </div>
                                    <span
                                        className={styles.deleteButton}
                                        onClick={(event) => handleDeleteConversation(conversation.id, event)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label="删除会话"
                                    >
                                        {deletingId === conversation.id ? (
                                            <Spin size="small" />
                                        ) : (
                                            <CloseOutlined />
                                        )}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <div>
                            <h2>个人 Rules</h2>
                            <p>保存后的全文 rules 会在每次与大模型对话时自动一起传入。</p>
                        </div>

                        <div className={styles.actions}>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={() => void loadRules()}
                                loading={rulesLoading}
                            >
                                加载当前值
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={() => void handleSaveRules()}
                                loading={rulesSaving}
                                disabled={rulesLoading}
                            >
                                保存
                            </Button>
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => void handleClearRules()}
                                loading={rulesSaving}
                                disabled={rulesLoading}
                            >
                                清空
                            </Button>
                        </div>
                    </div>

                    <Input.TextArea
                        value={rules}
                        onChange={(event) => setRules(event.target.value)}
                        className={styles.rulesInput}
                        placeholder="例如：优先输出完整文件；所有解释使用中文；避免修改未提及的模块。"
                        autoSize={{ minRows: 18, maxRows: 24 }}
                        disabled={rulesLoading}
                    />
                </section>
            </div>
        </div>
    )
}
