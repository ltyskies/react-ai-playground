/**
 * @file src/utils/token.ts
 * @description Token 管理工具模块
 * 提供 Token 的设置、获取和删除功能，使用 localStorage 存储
 * @author React AI Playground
 */

/**
 * Token 存储键名
 * 用于 localStorage 中存储 Token 的键
 */
const TOKEKEY = 'token'

/**
 * 设置 Token 到本地存储
 * @param token - JWT Token 字符串
 */
function setToken(token: string) {
    localStorage.setItem(TOKEKEY, token)
}

/**
 * 从本地存储获取 Token
 * @returns Token 字符串或 null
 */
function getToken() {
    return localStorage.getItem(TOKEKEY)
}

/**
 * 从本地存储删除 Token
 * 通常在退出登录或 Token 失效时调用
 */
function removeToken() {
    localStorage.removeItem(TOKEKEY)
}

export {
    setToken,
    getToken,
    removeToken
}
