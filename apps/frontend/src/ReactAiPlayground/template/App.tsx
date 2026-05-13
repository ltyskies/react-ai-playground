/**
 * @file src/ReactAiPlayground/template/App.tsx
 * @description 默认 App 组件模板
 * 新创建项目时的默认示例组件，展示基础的 React 状态管理
 * @author React AI Playground
 */

// React 核心库 - Hooks
import { useState } from 'react'

// 样式文件
import './App.css'

/**
 * 默认 App 组件
 * 简单的计数器示例，展示 React 状态管理
 */
function App() {
    // 计数器状态
    const [count, setCount] = useState(0)

    return (
        <>
            {/* 页面标题 */}
            <h1>Hello World</h1>
            {/* 计数器卡片 */}
            <div className='card'>
                {/* 点击按钮增加计数 */}
                <button onClick={() => setCount((count) => count + 1)}>
                    count is {count}
                </button>
            </div>
        </>
    )
}

export default App
