/**
 * @file src/ReactAiPlayground/components/ChatComponent/MessageItem/MarkdownRenderer/index.tsx
 * @description Markdown 渲染组件
 * 将 Markdown 文本渲染为 HTML，支持代码块高亮、GitHub 风格 Markdown 和文件应用功能
 * @author React AI Playground
 */

// React 核心库 - memo 和 Hooks 用于性能优化
import {
    Component,
    memo,
    useState,
    useEffect,
    useRef,
    type ErrorInfo,
    type ReactNode,
} from "react";

// 第三方库 - Markdown 渲染
import ReactMarkdown from "react-markdown";

// 第三方库 - GitHub 风格 Markdown 插件
import remarkGfm from "remark-gfm";

import type { StreamStatus } from "@/apis/chat";
import { extractCodeBlockFileName } from "@/ReactAiPlayground/components/ChatComponent/utils/codeBlockUtils";

// 项目内部组件 - 代码块组件
import CodeBlock from "@/ReactAiPlayground/components/ChatComponent/MessageItem/MarkdownRenderer/CodeBlock";

// 样式文件
import styles from '@/ReactAiPlayground/components/ChatComponent/MessageItem/MarkdownRenderer/index.module.scss';

/**
 * Markdown 渲染组件属性接口
 */
/**
 * Markdown 渲染组件属性接口
 */
interface MarkdownRendererProps {
    /** Markdown 文本内容 */
    content: string;
    /** 流式状态，用于判断是否需要修补未闭合代码块 */
    status: StreamStatus;
}

/**
 * Markdown 渲染错误边界属性
 */
interface MarkdownRenderErrorBoundaryProps {
    children: ReactNode;
    /** 原始 Markdown 文本，降级时直接展示 */
    content: string;
    /** 重置键，变化时自动清除错误状态 */
    resetKey: string;
}

/**
 * Markdown 渲染错误边界状态
 */
interface MarkdownRenderErrorBoundaryState {
    hasError: boolean;
}

/** 流式输出时为未闭合的代码块补上结束标记，避免渲染报错 */
const getDisplayMarkdown = (content: string, status: StreamStatus) => {
    const shouldFixUnclosedFence = (
        (status === 'pending' || status === 'interrupted') &&
        ((content.match(/```/g)?.length ?? 0) % 2 === 1)
    );

    if (!shouldFixUnclosedFence) {
        return content;
    }

    return `${content}${content.endsWith('\n') ? '' : '\n'}\`\`\``;
}

/**
 * Markdown 渲染错误边界
 * @description 捕获 react-markdown 渲染过程中的异常，降级展示原始文本
 */
class MarkdownRenderErrorBoundary extends Component<
    MarkdownRenderErrorBoundaryProps,
    MarkdownRenderErrorBoundaryState
> {
    state: MarkdownRenderErrorBoundaryState = {
        hasError: false,
    }

    static getDerivedStateFromError() {
        return {
            hasError: true,
        }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Markdown renderer crashed.', error, errorInfo);
    }

    componentDidUpdate(prevProps: MarkdownRenderErrorBoundaryProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className={styles.renderFallback}>
                    <div className={styles.renderWarning}>
                        Markdown 渲染异常，已切换为原文显示。
                    </div>
                    <pre className={styles.rawFallback}>{this.props.content}</pre>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * Markdown 渲染组件
 * 使用 react-markdown 渲染 Markdown 内容
 * 支持代码块语法高亮、GitHub 风格表格等
 * 支持从代码块中提取文件名并传递给 CodeBlock 组件
 * 使用防抖机制减少流式输出时的重渲染
 */
const MarkdownRenderer = memo(({ content, status }: MarkdownRendererProps) => {
    // 防抖后的显示内容
    const [displayContent, setDisplayContent] = useState(() => getDisplayMarkdown(content, status));
    // 防抖定时器引用
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const nextDisplayContent = getDisplayMarkdown(content, status);

        // 清除之前的定时器
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        // 立即更新（如果是空内容或内容变化较大）
        const contentLengthDiff = Math.abs(nextDisplayContent.length - displayContent.length);
        if (contentLengthDiff > 100 || nextDisplayContent.length === 0) {
            // 使用 requestAnimationFrame 避免同步 setState
            requestAnimationFrame(() => {
                setDisplayContent(nextDisplayContent);
            });
        } else {
            // 小变化使用防抖（30ms）
            timerRef.current = setTimeout(() => {
                setDisplayContent(nextDisplayContent);
                timerRef.current = null;
            }, 30);
        }

        // 清理函数
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, status]);

    return (
        <div className={styles.markdownBody}>
            <MarkdownRenderErrorBoundary
                content={content}
                resetKey={`${status}:${content}`}
            >
                <ReactMarkdown
                    // 使用 remark-gfm 插件支持 GitHub 风格 Markdown
                    remarkPlugins={[remarkGfm]}
                    // 自定义组件渲染
                    components={{
                        /**
                         * 自定义代码组件渲染
                         * 区分行内代码和代码块
                         */
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        code(props: any) {
                            const { inline, className, children, ...rest } = props;
                            // 提取语言类型
                            const match = /language-(\w+)/.exec(className || '');
                            const language = match ? match[1] : 'text';

                            // 提取文件名
                            const meta = rest.meta || '';
                            const fileName = extractCodeBlockFileName(meta, className);

                            // 如果是代码块且有语言标识，使用 CodeBlock 组件
                            return !inline && match ? (
                                <CodeBlock
                                    language={language}
                                    value={String(children).replace(/\n$/, '')}
                                    fileName={fileName}
                                />
                            ) : (
                                // 行内代码使用默认样式
                                <code className={styles.inlineCode} {...rest}>
                                    {children as ReactNode}
                                </code>
                            );
                        },
                    }}
                >
                    {displayContent}
                </ReactMarkdown>
            </MarkdownRenderErrorBoundary>
        </div>
    );
});

export default MarkdownRenderer;
