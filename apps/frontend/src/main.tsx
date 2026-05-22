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

// Ant Design - 主题配置
import { ConfigProvider } from 'antd'

// 项目内部模块 - 路由配置
import router from './router/index.tsx'

/**
 * 创建 React 根节点并渲染应用
 * 使用 ConfigProvider 统一 Ant Design 组件主题风格
 */
createRoot(document.getElementById('root')!).render(
    <ConfigProvider
        theme={{
            token: {
                colorPrimary: '#1677ff',
                colorSuccess: '#10a37f',
                colorWarning: '#faad14',
                colorError: '#ff4d4f',
                borderRadius: 8,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            },
        }}
    >
        <RouterProvider router={router} />
    </ConfigProvider>
)
