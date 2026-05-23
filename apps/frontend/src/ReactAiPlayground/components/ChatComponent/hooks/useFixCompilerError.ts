/**
 * @file src/ReactAiPlayground/components/ChatComponent/hooks/useFixCompilerError.ts
 * @description 全局 fix-compiler-error 事件监听 hook
 * 监听编译报错事件并自动生成修复追问发送到聊天接口
 * @author React AI Playground
 */

import { useEffect } from 'react';

export const useFixCompilerError = (submitChat: (text: string) => Promise<boolean>) => {
    useEffect(() => {
        const handleFixError = (e: Event) => {
            const customEvent = e as CustomEvent;
            const errorText = customEvent.detail.content;
            const prompt = `I ran into the following compiler error. Please fix it using the current file context:\n\n${errorText}`;
            void submitChat(prompt);
        };
        window.addEventListener('fix-compiler-error', handleFixError);
        return () => window.removeEventListener('fix-compiler-error', handleFixError);
    }, [submitChat]);
};
