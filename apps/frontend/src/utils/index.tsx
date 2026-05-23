/**
 * @file src/utils/index.tsx
 * @description 工具函数统一导出模块
 * 集中导出所有工具函数，方便其他模块统一导入
 * @author React AI Playground
 */

// HTTP 请求封装
import { request } from '@/utils/request'

// Token 管理函数
import { setToken, getToken, removeToken } from '@/utils/token'

/**
 * 统一导出所有工具函数
 * 其他模块可以通过 import { request, setToken, ... } from '@/utils' 导入
 */
export {
    request,
    setToken,
    getToken,
    removeToken
}
