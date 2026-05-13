/**
 * @file src/components/AuthRoute.tsx
 * @description 路由守卫组件
 * 检查用户是否已登录（通过 Token），未登录则重定向到登录页面
 * @author React AI Playground
 */

// 项目内部模块 - Token 管理
import { getToken } from '@/utils/token'

// React Router - 导航组件
import { Navigate } from 'react-router'

/**
 * 认证路由守卫组件
 * 用于包裹需要登录才能访问的页面
 * 
 * @param children - 子组件，认证通过时渲染的内容
 * @returns 如果已登录返回子组件，否则重定向到登录页
 */
export function AuthRoute({ children }: { children: React.ReactNode }) {
    // 获取本地存储的 Token
    const token = getToken()
    // 如果存在 Token，说明已登录，渲染子组件
    if (token) {
        return <>{children}</>
    } else {
        // 未登录，重定向到登录页面
        return <Navigate to={'/login'} replace />
    }
}
