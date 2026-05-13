/**
 * @file src/ReactAiPlayground/components/ChatComponent/useFilePicker.ts
 * @description 文件选择器状态管理 hook
 * 管理上下文文件选择器的弹出/关闭状态及点击外部关闭行为
 * @author React AI Playground
 */

import { useState, useRef, useEffect } from 'react';

export const useFilePicker = () => {
    const [showFilePicker, setShowFilePicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setShowFilePicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return { showFilePicker, setShowFilePicker, pickerRef };
};
