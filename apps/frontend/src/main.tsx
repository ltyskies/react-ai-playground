/**
 * @file src/main.tsx
 * @description React 应用入口文件
 * 负责创建 React 根节点并挂载路由提供者
 * @author React AI Playground
 */

// React 核心库 - DOM 渲染
import { createRoot } from 'react-dom/client'

// React Router - 路由提供者
import { RouterProvider } from 'react-router'

// 项目内部模块 - 路由配置
import router from './router/index.tsx'

/**
 * 创建 React 根节点并渲染应用
 * 使用 RouterProvider 提供路由功能
 */
createRoot(document.getElementById('root')!).render(
    <RouterProvider router={router} />
)
