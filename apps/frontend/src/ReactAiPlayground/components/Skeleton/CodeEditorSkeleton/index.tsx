/**
 * @file src/ReactAiPlayground/components/Skeleton/CodeEditorSkeleton/index.tsx
 * @description 代码编辑器骨架屏组件
 * 在代码编辑器加载时显示的占位动画效果
 * @author React AI Playground
 */

// 样式文件
import styles from './index.module.scss';

/**
 * 代码编辑器骨架屏组件
 * 显示文件列表和编辑器区域的占位结构
 */
const CodeEditorSkeleton = () => {
    return (
        <div className={styles.codeEditorSkeleton}>
            {/* 文件列表占位 */}
            <div className={styles.fileListSkeleton}></div>
            {/* 编辑器内容占位 */}
            <div className={`${styles.editorContentSkeleton} ${styles.skeleton}`}></div>
        </div>
    );
}

export default CodeEditorSkeleton;
