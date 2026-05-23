/**
 * @file src/ReactAiPlayground/components/Skeleton/ChatSkeleton/index.tsx
 * @description AI 聊天面板骨架屏组件
 * 在聊天组件加载时显示的占位动画效果
 * @author React AI Playground
 */

// 样式文件
import styles from '@/ReactAiPlayground/components/Skeleton/ChatSkeleton/index.module.scss';

/**
 * AI 聊天面板骨架屏组件
 * 显示简单的占位结构，提升加载体验
 */
const ChatSkeleton = () => {
    return (
        <div className={`${styles.chatSkeleton} skeleton`}>
            {/* 骨架屏头部 */}
            <div className={styles.chatHeaderSkeleton}>
                <span>AI助手</span>
            </div>
            {/* 骨架屏消息区域占位 */}
            <div className={styles.messagesViewportSkeleton}></div>
        </div>
    );
}

export default ChatSkeleton;
