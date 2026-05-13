/**
 * @file src/utils/request.ts
 * @description HTTP 请求封装模块
 * 基于 Axios 封装，包含请求拦截器（添加 Token）和响应拦截器（处理 401 错误）
 * @author React AI Playground
 */

// 第三方库 - HTTP 请求
import axios from 'axios'

// 项目内部模块 - Token 管理
import { getToken, removeToken } from '@/utils/token'

// 项目内部模块 - 路由实例
import router from '@/router'

/** 401 未授权统一处理：清除 Token、跳转登录并刷新页面 */
export const handleUnauthorized = () => {
    removeToken()
    router.navigate('/login')
    window.location.reload()
}

/**
 * API 基础 URL
 * 后端服务地址
 */
export const apiBaseUrl = 'http://localhost:3000'

/**
 * 创建 Axios 实例
 * 配置基础 URL 和超时时间
 */
const request = axios.create({
    // 基础 URL - 所有请求都会自动添加此前缀
    baseURL: apiBaseUrl,
    // 请求超时时间 - 5秒
    timeout: 5000
})

/**
 * 请求拦截器
 * 在请求发送前自动添加 Authorization Token
 */
request.interceptors.request.use((config) => {
    // 从本地存储获取 Token
    const token = getToken()
    console.log('请求拦截器', token)
    // 如果存在 Token，添加到请求头
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
}, (error) => {
    // 请求错误处理
    return Promise.reject(error)
})

/**
 * 响应拦截器
 * 处理响应数据和错误，特别是 401 未授权错误
 */
request.interceptors.response.use((response) => {
    // 2xx 范围内的状态码都会触发该函数
    // 直接返回响应数据
    return response.data
}, (error) => {
    // 超出 2xx 范围的状态码都会触发该函数
    // 监控 401 Token 失效
    console.dir(error)
    if (error?.response?.status === 401) {
        handleUnauthorized()
    }
    return Promise.reject(error)
})

export { request }
