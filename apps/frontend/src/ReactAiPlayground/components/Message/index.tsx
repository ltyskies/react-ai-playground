/**
 * @file src/ReactAiPlayground/components/Message/index.tsx
 * @description 消息提示组件
 * 显示错误或警告消息，支持一键纠错功能
 * @author React AI Playground
 */

// 第三方库 - CSS 类名合并
import classnames from 'classnames'

// React 核心库
import React, { useEffect, useState } from 'react'

// 样式文件
import styles from '@/ReactAiPlayground/components/Message/index.module.scss'

/**
 * 消息组件属性接口
 */
export interface MessageProps {
    type: 'error' | 'warn'  // 消息类型：错误或警告
    content: string         // 消息内容
}

/**
 * 消息提示组件
 * 用于显示编译错误或警告信息
 * 支持一键纠错功能，点击后向常驻的 AI 聊天面板派发错误信息
 */
export const Message: React.FC<MessageProps> = (props) => {
    const { type, content } = props;
    // 组件显示状态
    const [visible, setVisible] = useState(false);

    /**
     * 内容变化时更新显示状态
     */
    useEffect(() => {
        setVisible(!!content);
    }, [content]);

    /**
     * 处理一键纠错
     * 聊天面板常驻，直接派发事件把错误内容交给 ChatComponent
     */
    const handleFixClick = () => {
        window.dispatchEvent(new CustomEvent('fix-compiler-error', {
            detail: { content },
        }));
    };

    // 没有内容时不渲染
    return visible ? (
        <div className={classnames(styles.msg, styles[type])}>
            {/* 关闭按钮固定在右上角 */}
            <button className={styles.dismiss} onClick={() => setVisible(false)}>
                ✕
            </button>

            {/* 消息内容 */}
            <pre>{content}</pre>

            {/* 一键纠错按钮 - 仅在错误类型时显示，独占底部操作行避免与关闭按钮重叠 */}
            {type === 'error' && (
                <div className={styles.actions}>
                    <button
                        className={styles.fixBtn}
                        onClick={handleFixClick}
                    >
                        ✨ 一键纠错
                    </button>
                </div>
            )}
        </div>
    ) : null;
};
