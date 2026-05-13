/**
 * @file src/ReactAiPlayground/components/ChatComponent/MessageItem/MarkdownRenderer/CodeBlock/index.tsx
 * @description Markdown 代码块渲染组件
 * 负责代码高亮、复制代码，以及把带文件名的代码块一键写回工作区
 * @author React AI Playground
 */

import { memo, useContext, useState } from 'react';
import { Check, Copy, FileCode } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight as prismTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { AIPlaygroundContext } from '@/ReactAiPlayground/AIPlaygroundContext';

import styles from './index.module.scss';

/**
 * 代码块组件属性
 */
interface CodeBlockProps {
    language: string
    value: string
    fileName?: string
}

/**
 * Markdown 代码块组件
 * 如果代码块中携带文件名，则允许直接把代码写入 AI Playground 工作区
 */
const CodeBlock = memo(({ language, value, fileName }: CodeBlockProps) => {
    // 用短暂成功态反馈复制和应用操作已经完成。
    const [copied, setCopied] = useState(false);
    const [applied, setApplied] = useState(false);
    const { writeFile } = useContext(AIPlaygroundContext);

    const onCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const onApply = () => {
        // 只有识别出目标文件名时，才允许把代码块内容直接落到工作区。
        if (!fileName) return;

        writeFile(fileName, value, { select: true });
        setApplied(true);
        setTimeout(() => setApplied(false), 2000);
    };

    // 带文件名的代码块可视为“可落盘补丁”，显示 Apply 操作按钮。
    const canApply = !!fileName;

    return (
        <div className={styles.codeBlockWrapper}>
            <div className={styles.codeHeader}>
                <div className={styles.headerLeft}>
                    <span className={styles.language}>{language}</span>
                    {fileName && (
                        <span className={styles.fileName}>
                            <FileCode size={12} />
                            {fileName}
                        </span>
                    )}
                </div>
                <div className={styles.buttonGroup}>
                    {canApply && (
                        <button
                            onClick={onApply}
                            className={`${styles.actionBtn} ${styles.applyBtn} ${applied ? styles.success : ''}`}
                            title={`Apply to ${fileName}`}
                        >
                            {applied ? <Check size={14} /> : <FileCode size={14} />}
                            {applied ? 'Applied' : 'Apply to file'}
                        </button>
                    )}
                    <button
                        onClick={onCopy}
                        className={`${styles.actionBtn} ${styles.copyBtn} ${copied ? styles.success : ''}`}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>
            <SyntaxHighlighter
                language={language}
                style={prismTheme}
                customStyle={{
                    margin: 0,
                    borderRadius: '0 0 8px 8px',
                    background: 'transparent',
                    fontSize: '14px'
                }}
                codeTagProps={{
                    style: { color: '#000000', fontFamily: 'Fira Code, monospace' }
                }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
});

export default CodeBlock;
