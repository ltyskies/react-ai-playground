/**
 * @file src/apis/user.ts
 * @description 用户相关 API 接口模块
 * 包含用户登录等接口
 * @author React AI Playground
 */

// 项目内部模块 - HTTP 请求封装
import { request } from '@/utils'

/**
 * 登录表单数据接口
 * @property email - 用户邮箱地址
 * @property password - 用户登录密码
 */
interface LoginFormData {
    email: string;
    password: string;
}

/**
 * 用户登录 API
 * 发送登录请求，验证用户身份
 * @param formData - 登录表单数据，包含邮箱和密码
 * @returns Promise 包含登录响应结果
 */
export function loginAPI(formData: LoginFormData) {
    return request({
        url: 'user/login',
        method: 'POST',
        data: formData
    })
}

/**
 * 获取用户提示词规则
 * @description 获取当前登录用户的自定义提示词规则配置
 * @returns 包含提示词规则的响应
 */
export function getPromptRulesAPI() {
    return request({
        url: 'user/rules',
        method: 'GET',
    })
}

/**
 * 更新用户提示词规则
 * @description 更新当前登录用户的自定义提示词规则
 * @param rules - 新的提示词规则
 * @returns 更新结果的响应
 */
export function updatePromptRulesAPI(rules: string) {
    return request({
        url: 'user/rules/update',
        method: 'POST',
        data: {
            rules,
        }
    })
}

/**
 * 清除用户提示词规则
 * @description 清除当前登录用户的自定义提示词规则
 * @returns 操作结果的响应
 */
export function clearPromptRulesAPI() {
    return request({
        url: 'user/rules/clear',
        method: 'POST',
    })
}
