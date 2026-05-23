/**
 * @file src/ReactAiPlayground/components/CodeEditor/FileNameList/FileNameItem.tsx
 * @description 单个文件标签组件
 * 显示文件名，支持选中、重命名、删除功能
 * @author React AI Playground
 */

// 第三方库 - CSS 类名合并
import classnames from 'classnames'

// React 核心库
import React, { useState, useRef, useEffect } from 'react'

// 样式文件
import styles from '@/ReactAiPlayground/components/CodeEditor/FileNameList/index.module.scss'

// Ant Design 组件 - 确认弹窗
import { Popconfirm } from 'antd'

/**
 * 文件标签组件属性接口
 */
export interface FileNameItemProps {
    value: string           // 文件名
    actived: boolean        // 是否被选中
    creating: boolean       // 是否正在创建（进入编辑模式）
    readonly: boolean       // 是否只读（不允许删除和重命名）
    onEditComplete: (name: string) => void  // 编辑完成回调
    onRemove: () => void    // 删除回调
    onClick: () => void     // 点击回调
}

/**
 * 单个文件标签组件
 * 支持显示文件名、双击重命名、删除确认
 */
export const FileNameItem: React.FC<FileNameItemProps> = (props) => {
    const {
        value,
        actived = false,
        creating,
        readonly,
        onClick,
        onRemove,
        onEditComplete,
    } = props

    // 当前编辑的文件名
    const [name, setName] = useState(value)
    // 是否处于编辑模式
    const [editing, setEditing] = useState(creating)
    // 输入框引用
    const inputRef = useRef<HTMLInputElement>(null)

    /**
     * 双击进入编辑模式
     */
    const handleDoubleClick = () => {
        // 只读文件不允许编辑
        if (readonly) return
        setEditing(true)
        // 延迟聚焦，等待 DOM 更新
        setTimeout(() => {
            inputRef.current?.focus()
        }, 0)
    }

    /**
     * 新建文件时自动聚焦
     */
    useEffect(() => {
        if (creating) {
            inputRef?.current?.focus()
        }
    }, [creating])

    /**
     * 输入框失去焦点时退出编辑模式
     */
    const handleInputBlur = () => {
        setEditing(false)
        onEditComplete(name)
    }

    return (
        <div
            className={classnames(styles['tab-item'], actived ? styles.actived : null)}
            onClick={onClick}
        >
            {
                // 编辑模式显示输入框
                editing ? (
                    <input
                        ref={inputRef}
                        className={styles['tabs-item-input']}
                        value={name}
                        onBlur={handleInputBlur}
                        onChange={(e) => setName(e.target.value)}
                    />
                ) : (
                    // 非编辑模式显示文件名和删除按钮
                    <>
                        {/* 文件名 - 双击进入编辑模式 */}
                        <span onDoubleClick={!readonly ? handleDoubleClick : () => { }}>{name}</span>
                        {
                            // 非只读文件显示删除按钮
                            !readonly ? (
                                <Popconfirm
                                    title="确认删除该文件吗？"
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={(e) => {
                                        e?.stopPropagation();
                                        onRemove();
                                    }}
                                >
                                    <span style={{ marginLeft: 5, display: 'flex' }}>
                                        {/* 删除图标 SVG */}
                                        <svg width='12' height='12' viewBox='0 0 24 24'>
                                            <line stroke='#999' x1='18' y1='6' x2='6' y2='18'></line>
                                            <line stroke='#999' x1='6' y1='6' x2='18' y2='18'></line>
                                        </svg>
                                    </span>
                                </Popconfirm>
                            ) : null
                        }
                    </>
                )
            }
        </div>
    )
}
