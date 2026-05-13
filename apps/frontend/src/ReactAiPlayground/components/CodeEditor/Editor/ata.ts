/**
 * @file src/ReactAiPlayground/components/CodeEditor/Editor/ata.ts
 * @description 自动类型获取 (ATA) 模块
 * 基于 @typescript/ata 实现，自动从 npm 下载类型定义文件
 * @author React AI Playground
 */

// TypeScript 自动类型获取库
import { setupTypeAcquisition } from '@typescript/ata'

// TypeScript 核心库
import typescriprt from 'typescript';

/**
 * 创建自动类型获取实例
 * 自动分析代码中的 import 语句，下载对应的类型定义文件
 * 
 * @param onDownloadFile - 类型文件下载完成回调
 * @param onDownloadFile.code - 类型文件内容
 * @param onDownloadFile.path - 类型文件路径
 * @returns ATA 实例函数
 */
export function createATA(onDownloadFile: (code: string, path: string) => void) {
    const ata = setupTypeAcquisition({
        // 项目名称
        projectName: 'my-ata',
        // TypeScript 实例
        typescript: typescriprt,
        // 日志输出
        logger: console,
        // 委托配置
        delegate: {
            /**
             * 接收到类型文件时的回调
             * @param code - 类型文件内容
             * @param path - 类型文件路径
             */
            receivedFile: (code, path) => {
                console.log('自动下载的包', path);
                // 调用外部回调，将类型定义传递给 Monaco Editor
                onDownloadFile(code, path);
            }
        },
    })

    return ata;
}
