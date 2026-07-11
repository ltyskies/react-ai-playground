/**
 * @file src/ReactAiPlayground/files.ts
 * @description 文件初始化模块
 * 定义默认文件模板和初始文件集合
 * @author React AI Playground
 */

// 项目内部模块 - 类型定义
import type { Files } from '@/ReactAiPlayground/AIPlaygroundContext'

// 默认模板文件 - 使用 ?raw 后缀作为字符串导入
import importMap from '@/ReactAiPlayground/template/import-map.json?raw'
import AppCss from '@/ReactAiPlayground/template/App.css?raw'
import App from '@/ReactAiPlayground/template/App.tsx?raw'
import main from '@/ReactAiPlayground/template/main.tsx?raw'

// 项目内部模块 - 工具函数
import { fileName2Language } from '@/ReactAiPlayground/utils'

/**
 * App 组件文件名
 * 主应用组件文件
 */
export const APP_COMPONENT_FILE_NAME = 'src/App.tsx'

/**
 * Import Map 文件名
 * 定义 ESM 模块映射，用于浏览器导入第三方库
 * 属于工程配置而非模块，保留在工作区根目录
 */
export const IMPORT_MAP_FILE_NAME = 'import-map.json'

/**
 * 入口文件名
 * 应用入口文件
 */
export const ENTRY_FILE_NAME = 'src/main.tsx'

/**
 * App 样式文件名
 */
export const APP_STYLE_FILE_NAME = 'src/App.css'

/**
 * 初始文件集合
 * 包含应用运行所需的基本文件
 * 采用 src/ 目录组织源码，import-map.json 作为工程配置置于根目录
 */
export const initFiles: Files = {
    // 入口文件
    [ENTRY_FILE_NAME]: {
        name: ENTRY_FILE_NAME,
        language: fileName2Language(ENTRY_FILE_NAME),
        value: main,
    },
    // App 组件
    [APP_COMPONENT_FILE_NAME]: {
        name: APP_COMPONENT_FILE_NAME,
        language: fileName2Language(APP_COMPONENT_FILE_NAME),
        value: App,
    },
    // App 样式文件
    [APP_STYLE_FILE_NAME]: {
        name: APP_STYLE_FILE_NAME,
        language: 'css',
        value: AppCss,
    },
    // Import Map 文件
    [IMPORT_MAP_FILE_NAME]: {
        name: IMPORT_MAP_FILE_NAME,
        language: fileName2Language(IMPORT_MAP_FILE_NAME),
        value: importMap,
    },
}
