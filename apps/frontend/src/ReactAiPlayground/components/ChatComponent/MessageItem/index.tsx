/**
 * @file src/ReactAiPlayground/components/ChatComponent/MessageItem/index.tsx
 * @description 消息项组件
 * 使用 memo 优化，避免消息列表滚动时出现不必要的重复渲染
 * @author React AI Playground
 */

import { memo } from 'react';
import { Bot, RotateCcw, User } from 'lucide-react';

import type { Message } from '@/store/chatStore';
import { hasExtractableCodeBlock } from '../utils/codeBlockUtils';
import MarkdownRenderer from './MarkdownRenderer';

import styles from './index.module.scss';

/** 将流式状态枚举值映射为中文展示标签 */
const getStatusLabel = (status: Message['status']) => {
    if (status === 'failed') {
        return '失败';
    }

    if (status === 'interrupted') {
        return '已中断';
    }

    if (status === 'pending') {
        return '待重试';
    }

    return '已完成';
}

/**
 * MessageItem 组件属性接口
 */
interface MessageItemProps {
    /** 消息数据 */
    msg: Message;
    /** 是否正在生成回复 */
    isTyping: boolean;
    /** 是否为列表最后一条消息 */
    isLast: boolean;
    /** 是否禁止重试按钮 */
    retryDisabled?: boolean;
    /** 重试回调，传入对应 requestId */
    onRetry?: (requestId: string) => void;
}

/**
 * 消息项组件
 * @description 使用 memo 优化渲染，单条消息展示头像、气泡内容和重试入口
 */
const MessageItem = memo(({ msg, isTyping, isLast, retryDisabled = false, onRetry }: MessageItemProps) => {
    const showTypingCursor = isTyping && isLast && msg.role === 'assistant' && msg.status === 'pending'
    // 代码块存在但不满足自动提取协议时，给用户一个轻提示。
    const showCodeBlockProtocolTip = (
        msg.role === 'assistant' &&
        msg.status === 'completed' &&
        msg.content.includes('```') &&
        !hasExtractableCodeBlock(msg.content)
    )
    const canRetry = (
        msg.role === 'assistant' &&
        !!msg.requestId &&
        !!msg.retryable &&
        !showTypingCursor &&
        !!onRetry
    )
    const showStatusMeta = (
        msg.role === 'assistant' &&
        !showTypingCursor &&
        (msg.status !== 'completed' || !!msg.errorMessage || canRetry)
    )

    return (
        <div className={`${styles.messageItem} ${styles[msg.role]}`}>
            <div className={`${styles.avatar} ${styles[`${msg.role}Avatar`]}`}>
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
            </div>

            <div className={styles.messageBubble}>
                <MarkdownRenderer content={msg.content} status={msg.status} />
                {showCodeBlockProtocolTip && (
                    <div className={styles.protocolTip}>
                        检测到代码块，但未满足自动提取格式，仅可手动复制或应用。
                    </div>
                )}
                {showTypingCursor && (
                    <span className={styles.typingCursor} />
                )}
                {showStatusMeta && (
                    <div className={styles.messageMeta}>
                        <span className={`${styles.statusTag} ${styles[`status${msg.status}`]}`}>
                            {getStatusLabel(msg.status)}
                        </span>
                        {msg.errorMessage && (
                            <span className={styles.statusText}>{msg.errorMessage}</span>
                        )}
                        {canRetry && msg.requestId && (
                            <button
                                type="button"
                                className={styles.retryButton}
                                onClick={() => onRetry?.(msg.requestId as string)}
                                disabled={retryDisabled}
                            >
                                <RotateCcw size={14} />
                                <span>重试</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

export default MessageItem;
