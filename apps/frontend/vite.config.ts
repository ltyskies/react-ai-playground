/**
 * @file vite.config.ts
 * @description Vite 构建工具配置文件
 * 配置 React 插件、代码分割、路径别名等
 * @author React AI Playground
 */

// Vite 核心配置
import { defineConfig } from 'vite'

// Vite React 插件 - 使用 SWC 编译
import react from '@vitejs/plugin-react-swc'

// Node.js 路径模块
import path from 'path'

// Vite 代码分割插件
import { chunkSplitPlugin } from 'vite-plugin-chunk-split'

/**
 * Vite 配置对象
 * 详细配置：https://vite.dev/config/
 */
export default defineConfig({
  // 插件配置
  plugins: [
    // React SWC 插件 - 更快的编译速度
    react(),
    // 代码分割插件 - 优化打包体积
    chunkSplitPlugin({
      customSplitting: {
        // Monaco Editor 相关库单独打包
        'monaco-vendor': [/node_modules\/monaco-editor/, /node_modules\/@monaco-editor/],
        // 编译器相关库单独打包
        'compiler-vendor': [/node_modules\/@swc\/wasm-web/, /node_modules\/@typescript\/ata/],
        // React + Ant Design 核心框架合并打包（避免循环引用）
        'framework-vendor': [/node_modules\/(react|react-dom|react-router|antd|@ant-design)/],
        // 工具库单独打包
        'utils-vendor': [/node_modules\/(zustand|immer|lodash-es|axios|classnames)/],
        // Markdown 相关库单独打包
        'markdown-vendor': [/node_modules\/(react-markdown|remark-gfm|react-syntax-highlighter)/],
        // UI 布局组件单独打包
        'ui-layout': [/node_modules\/(allotment|react-virtuoso|virtua|lucide-react)/],
        // 文件处理工具单独打包
        'file-tools': [/node_modules\/(jszip|fflate|file-saver)/],
      }
    })
  ],
  // 基础路径配置
  base: '/',
  // CSS 预处理配置 - 锁定 Sass API，避免默认行为变化
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  // 路径解析配置
  resolve: {
    // 路径别名 - @ 指向 src 目录
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
