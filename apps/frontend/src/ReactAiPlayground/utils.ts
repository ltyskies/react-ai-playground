/**
 * @file src/ReactAiPlayground/utils.ts
 * @description AI Playground 工具函数模块
 * 提供文件处理、数据压缩解压、文件下载等工具函数
 * @author React AI Playground
 */

// 第三方库 - 文件保存
import { saveAs } from "file-saver"

// 第三方库 - ZIP 压缩
import JSZip from "jszip"

// 项目内部模块 - 类型定义
import type { Files } from "@/ReactAiPlayground/AIPlaygroundContext"

/**
 * 根据文件名获取语言类型
 * 用于 Monaco Editor 语法高亮
 * @param name - 文件名
 * @returns 语言类型字符串
 */
export const fileName2Language = (name: string) => {
    // 获取文件后缀
    const suffix = name.split('.').pop() || ''
    // 根据后缀判断语言类型
    if (['js', 'jsx'].includes(suffix)) return 'javascript'
    if (['ts', 'tsx'].includes(suffix)) return 'typescript'
    if (['json'].includes(suffix)) return 'json'
    if (['css'].includes(suffix)) return 'css'
    // 默认返回 javascript
    return 'javascript'
}

/**
 * 下载所有文件为 ZIP 压缩包
 * @param files - 文件集合对象
 */
export async function downloadFiles(files: Files) {
    // 创建 JSZip 实例
    const zip = new JSZip()

    // 遍历所有文件，添加到 ZIP
    Object.keys(files).forEach((name) => {
        zip.file(name, files[name].value)
    })

    // 生成 ZIP 文件
    const blob = await zip.generateAsync({ type: 'blob' })
    
    // 下载文件（使用随机数生成文件名）
    saveAs(blob, `code${Math.random().toString().slice(2, 8)}.zip`)
}
