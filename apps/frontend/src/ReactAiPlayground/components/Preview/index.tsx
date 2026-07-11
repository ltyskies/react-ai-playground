/**
 * @file src/ReactAiPlayground/components/Preview/index.tsx
 * @description 运行预览面板组件
 * 通过 Worker 异步编译当前文件集合，并把产物注入 iframe 进行沙箱预览
 * @author React AI Playground
 */

import { useEffect, useRef, useState } from 'react';

import { usePlaygroundStore } from '@/store/playgroundStore';
import { type Files } from '@/ReactAiPlayground/AIPlaygroundContext';
import { Message } from '@/ReactAiPlayground/components/Message';
import { IMPORT_MAP_FILE_NAME } from '@/ReactAiPlayground/files';

import iframeRaw from '@/ReactAiPlayground/components/Preview/iframe.html?raw';
import CompilerWorker from '@/ReactAiPlayground/components/Preview/compiler.worker?worker';

/**
 * 发送给编译 Worker 的请求格式
 */
interface CompileRequest {
    type: 'COMPILE'
    files: Files
}

/**
 * Worker 编译成功时返回的数据
 */
interface CompileSuccess {
    type: 'COMPILED_CODE'
    code: string
}

/**
 * Worker 编译失败时返回的数据
 */
interface CompileError {
    type: 'ERROR'
    message: string
}

/**
 * iframe 运行时通过 postMessage 回传的错误数据
 */
interface PreviewMessageData {
    type: 'ERROR'
    message: string
}

// 运行时代码和其他窗口消息共用同一通道，这里先做类型守卫再消费。
const isPreviewMessageData = (data: unknown): data is PreviewMessageData => {
    if (!data || typeof data !== 'object') {
        return false;
    }

    const previewData = data as Partial<PreviewMessageData>;
    return previewData.type === 'ERROR' && typeof previewData.message === 'string';
};

export default function Preview() {
    const files = usePlaygroundStore((state) => state.files);

    const [compiledCode, setCompiledCode] = useState('');
    const [error, setError] = useState('');
    const [iframeUrl, setIframeUrl] = useState('');

    // Worker 负责后台编译，定时器用于合并高频编辑输入，iframeUrlRef 方便回收旧 Blob。
    const compilerWorkerRef = useRef<Worker | null>(null);
    const compileTimerRef = useRef<number | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const iframeUrlRef = useRef('');

    useEffect(() => {
        // 预览面板只创建一个 Worker，避免每次文件变更都重新初始化编译环境。
        const worker = new CompilerWorker();
        const handleWorkerMessage = ({ data }: MessageEvent<CompileSuccess | CompileError>) => {
            if (data.type === 'COMPILED_CODE') {
                setCompiledCode(data.code);
                setError('');
            } else if (data.type === 'ERROR') {
                setError(data.message);
            }
        };

        worker.addEventListener('message', handleWorkerMessage);
        compilerWorkerRef.current = worker;

        return () => {
            worker.removeEventListener('message', handleWorkerMessage);
            worker.terminate();
            compilerWorkerRef.current = null;
        };
    }, []);

    useEffect(() => {
        // 编辑器连续输入时稍作等待，把多次变更合并为一次编译请求。
        if (compileTimerRef.current !== null) {
            window.clearTimeout(compileTimerRef.current);
        }

        compileTimerRef.current = window.setTimeout(() => {
            const request: CompileRequest = {
                type: 'COMPILE',
                files,
            };
            compilerWorkerRef.current?.postMessage(request);
        }, 500);

        return () => {
            if (compileTimerRef.current !== null) {
                window.clearTimeout(compileTimerRef.current);
                compileTimerRef.current = null;
            }
        };
    }, [files]);

    const getIframeUrl = () => {
        // 每次都把最新 import map 和编译结果注入模板，生成新的沙箱页面。
        const html = iframeRaw.replace(
            '<script type="importmap"></script>',
            `<script type="importmap">${files[IMPORT_MAP_FILE_NAME]?.value || ''}</script>`
        ).replace(
            '<script type="module" id="appSrc"></script>',
            `<script type="module" id="appSrc">${compiledCode}</script>`,
        );

        return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    };

    useEffect(() => {
        if (!compiledCode) return;

        // 生成新的 Blob URL 后立即替换旧地址，避免 iframe 持有过期代码。
        const nextIframeUrl = getIframeUrl();
        const currentIframeUrl = iframeUrlRef.current;

        iframeUrlRef.current = nextIframeUrl;
        setIframeUrl(nextIframeUrl);

        if (currentIframeUrl) {
            URL.revokeObjectURL(currentIframeUrl);
        }
    }, [files[IMPORT_MAP_FILE_NAME]?.value, compiledCode]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent<unknown>) => {
            // 只接收当前 iframe 同源发回的错误消息，避免污染全局 message 通道。
            if (event.source !== iframeRef.current?.contentWindow) return;
            if (event.origin !== window.location.origin) return;
            if (!isPreviewMessageData(event.data)) return;

            setError(event.data.message);
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    useEffect(() => {
        return () => {
            // 统一回收定时器和 Blob URL，防止热更新或切页时泄漏浏览器资源。
            if (compileTimerRef.current !== null) {
                window.clearTimeout(compileTimerRef.current);
                compileTimerRef.current = null;
            }

            if (iframeUrlRef.current) {
                URL.revokeObjectURL(iframeUrlRef.current);
                iframeUrlRef.current = '';
            }
        };
    }, []);

    return (
        <div style={{ height: '100%' }}>
            {/* iframe 只负责运行编译产物，错误展示仍统一交给外层 Message 组件。 */}
            <iframe
                ref={iframeRef}
                src={iframeUrl || undefined}
                style={{
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    border: 'none',
                }}
            />
            <Message type='error' content={error} />
        </div>
    );
}
