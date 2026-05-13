/**
 * @file src/apis/chat.ts
 * @description 聊天相关 API 接口模块
 * @author React AI Playground
 */

import type { ConversationWorkspace } from '@/ReactAiPlayground/AIPlaygroundContext'
import { request } from '@/utils'

export type StreamStatus = 'pending' | 'completed' | 'failed' | 'interrupted'

export interface ConversationSummary {
    id: number
    title: string
    createdAt: string
    updatedAt: string
}

export interface ConversationMessage {
    id: number
    role: 'user' | 'assistant' | 'system'
    content: string
    requestId: string | null
    status: StreamStatus
    createdAt: string
}

export interface ConversationDetail {
    id: number
    title: string
    createdAt: string
    updatedAt: string
    messages: ConversationMessage[]
    workspaceSnapshot: ConversationWorkspace | null
}

/**
 * 创建新会话
 * @description 向服务器请求创建一个新的聊天会话
 * @returns 包含新创建会话 ID 的响应
 */
export function createNewConversationAPI() {
    return request({
        url: 'chat/conversation',
        method: 'POST',
    })
}

/**
 * 获取会话列表
 * @description 获取当前用户的所有聊天会话列表
 * @returns 包含会话摘要列表的响应
 */
export function getConversationListAPI() {
    return request({
        url: 'chat/conversations',
        method: 'GET',
    })
}

/**
 * 获取会话详情
 * @description 获取指定会话的详细信息和消息列表
 * @param id - 会话 ID
 * @returns 包含会话详情的响应
 */
export function getConversationDetailAPI(id: number) {
    return request({
        url: `chat/conversation?id=${id}`,
        method: 'GET',
    })
}

/**
 * 保存会话工作区
 * @description 保存当前会话的代码编辑器状态和工作区快照到服务器
 * @param conversationId - 会话 ID
 * @param workspace - 工作区数据
 * @returns 保存结果的响应
 */
export function saveConversationWorkspaceAPI(
    conversationId: number,
    workspace: ConversationWorkspace
) {
    return request({
        url: 'chat/conversation/workspace',
        method: 'POST',
        data: {
            conversationId,
            workspace,
        }
    })
}

/**
 * 删除会话
 * @description 删除指定会话（仅删除会话记录，不删除关联的消息）
 * @param conversationId - 会话 ID
 * @returns 删除结果的响应
 */
export function deleteConversationAPI(conversationId: number) {
    return request({
        url: 'chat/conversation/delete',
        method: 'POST',
        data: { conversationId },
    })
}
