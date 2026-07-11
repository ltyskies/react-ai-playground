/**
 * @file src/ReactAiPlayground/components/ChatComponent/hooks/useFilePicker.ts
 * @description 文件选择器状态管理 hook
 * 管理上下文文件选择器的弹出/关闭状态及点击外部关闭行为
 * @author React AI Playground
 */

import { useState, useRef, useEffect } from 'react';

export const useFilePicker = () => {
    const [showFilePicker, setShowFilePicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // 下拉框通过 Portal 渲染到 body，不在 pickerRef 内，需单独判断
            const clickInsidePicker = pickerRef.current?.contains(target);
            const clickInsideDropdown = dropdownRef.current?.contains(target);
            if (!clickInsidePicker && !clickInsideDropdown) {
                setShowFilePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return { showFilePicker, setShowFilePicker, pickerRef, dropdownRef };
};
