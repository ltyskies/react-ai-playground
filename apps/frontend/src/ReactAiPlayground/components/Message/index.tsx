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
import styles from './index.module.scss'

// 项目内部 Context - AI Playground 全局状态
import { AIPlaygroundContext } from '@/ReactAiPlayground/AIPlaygroundContext'

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
 * 支持一键纠错功能，点击后打开 AI 聊天面板并发送错误信息
 */
export const Message: React.FC<MessageProps> = (props) => {
    const { type, content } = props;
    // 组件显示状态
    const [visible, setVisible] = useState(false);
    // 从 Context 获取 AI 面板控制方法
    const { setIsShow } = React.useContext(AIPlaygroundContext);

    /**
     * 内容变化时更新显示状态
     */
    useEffect(() => {
        setVisible(!!content);
    }, [content]);

    /**
     * 处理一键纠错
     * 打开 AI 聊天面板并发送错误信息
     */
    const handleFixClick = () => {
        // 打开 AI 聊天面板
        setIsShow(true);
        console.log('一键纠错，发送内容：', content);
        // 延迟发送，等待面板打开动画完成
        setTimeout(() => {
            // 触发自定义事件，将错误内容发送给 ChatComponent
            const event = new CustomEvent('fix-compiler-error', {
                detail: { content }
            });
            window.dispatchEvent(event);
        }, 300);
    };

    // 没有内容时不渲染
    return visible ? (
        <div className={classnames(styles.msg, styles[type])}>
            {/* 消息内容 */}
            <pre>{content}</pre>

            {/* 一键纠错按钮 - 仅在错误类型时显示 */}
            {type === 'error' && (
                <button
                    className={styles.fixBtn}
                    onClick={handleFixClick}
                    style={{ marginRight: '10px', cursor: 'pointer' }}
                >
                    ✨ 一键纠错
                </button>
            )}

            {/* 关闭按钮 */}
            <button className={styles.dismiss} onClick={() => setVisible(false)}>
                ✕
            </button>
        </div>
    ) : null;
};
