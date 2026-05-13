/**
 * @file src/ReactAiPlayground/components/ChatComponent/sseParser.ts
 * @description SSE 事件解析工具（纯函数，无 React 依赖）
 * 负责解析服务端 text/event-stream 响应，提取事件名和数据
 * @author React AI Playground
 */

/** 流式响应空闲超时阈值，超过该时间无新分片则主动中断 */
export const STREAM_IDLE_TIMEOUT_MS = 30_000

/** SSE 流响应 Content-Type */
export const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream'

/** SSE 解析后的单条事件 */
export interface ParsedSseEvent {
    event: string
    data: string
}

/** 服务端流错误事件的载荷格式 */
export interface StreamErrorPayload {
    message?: string
    retryable?: boolean
    reason?: string
}

/** 生成唯一请求 ID，格式为时间戳加随机后缀 */
export const createRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** 提取 SSE 行中前缀之后的值部分 */
const getSseLineValue = (line: string, prefix: string) => {
    return line.slice(prefix.length).trimStart();
};

// 前端按 event/data 行手动解析 SSE 事件，兼容服务端分片输出。
export const parseSseEvent = (rawEvent: string): ParsedSseEvent | null => {
    const lines = rawEvent.replace(/\r/g, '').split('\n');
    const dataLines: string[] = [];
    let event = 'message';

    for (const line of lines) {
        if (!line || line.startsWith(':')) {
            continue;
        }

        if (line.startsWith('event:')) {
            event = getSseLineValue(line, 'event:');
            continue;
        }

        if (line.startsWith('data:')) {
            dataLines.push(getSseLineValue(line, 'data:'));
        }
    }

    if (dataLines.length === 0) {
        return null;
    }

    return {
        event,
        data: dataLines.join('\n'),
    };
};
