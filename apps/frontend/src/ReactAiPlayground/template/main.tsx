/**
 * @file src/ReactAiPlayground/template/main.tsx
 * @description 默认入口文件模板
 * 新创建项目时的默认入口文件，负责渲染 App 组件到 DOM
 * @author React AI Playground
 */

// React DOM 客户端渲染
import ReactDOM from 'react-dom/client'

// 导入 App 组件
import App from './App'

/**
 * 创建 React 根节点并渲染 App 组件
 * 将应用挂载到 id 为 root 的 DOM 元素上
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />
)
