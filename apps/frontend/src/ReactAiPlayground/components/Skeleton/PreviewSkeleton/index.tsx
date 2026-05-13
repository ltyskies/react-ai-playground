/**
 * @file src/ReactAiPlayground/components/Skeleton/PreviewSkeleton/index.tsx
 * @description 代码预览骨架屏组件
 * 在预览组件加载时显示的占位动画效果
 * @author React AI Playground
 */

// 样式文件
import styles from './index.module.scss';

/**
 * 代码预览骨架屏组件
 * 显示预览加载中的占位效果
 */
const PreviewSkeleton = () => {
    return (
        <div className={`${styles.previewSkeleton} ${styles.skeleton}`}>
            {/* 加载提示文字 */}
            <span className={styles.loadingText}>预览中...</span>
        </div>
    );
}

export default PreviewSkeleton;
