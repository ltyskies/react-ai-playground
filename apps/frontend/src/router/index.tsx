/**
 * @file src/router/index.tsx
 * @description 应用路由配置文件
 * 定义所有页面路由，包括登录页、主页面和 404 页面
 * @author React AI Playground
 */

// React Router - 浏览器路由创建
import { createBrowserRouter, Navigate } from "react-router";

// 项目内部组件 - 路由守卫
import { AuthRoute } from "@/components/AuthRoute";

// 项目内部页面组件
import Login from "@/login";
import NotFound from "@/notFound";
import UserCenter from "@/userCenter";

// 项目内部 Context 和主页面
import { AIPlaygroundProvider } from "@/ReactAiPlayground/AIPlaygroundContext";
import ReactAiPlayground from "@/ReactAiPlayground";

// 样式文件
import '@/router/index.module.scss'; 

/**
 * 创建浏览器路由配置
 * 包含四个路由：
 * 1. / - 默认路由，跳转到主页面
 * 2. /index - 主页面（需要登录）
 * 3. /login - 登录页面
 * 4. * - 404 页面
 */
const router = createBrowserRouter([
    {
        // 默认路由 - 跳转到主页面
        path: '/',
        element: <Navigate to="/index" replace />,
    },
    {
        // 主页面路由 - 需要登录认证
        path: '/index',
        element: (
            <AuthRoute>
                <AIPlaygroundProvider>
                    <ReactAiPlayground />
                </AIPlaygroundProvider>
            </AuthRoute>
        ),
    },
    {
        // 登录页面路由
        path: '/login',
        element: <Login />,
    },
    {
        path: '/user-center',
        element: (
            <AuthRoute>
                <UserCenter />
            </AuthRoute>
        ),
    },
    {
        // 404 页面路由 - 匹配所有未定义路径
        path: "*",
        element: <NotFound />
    }
]);

export default router;
