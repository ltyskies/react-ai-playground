# React AI Playground

一个浏览器内的 React + TypeScript AI 编程工作台，同时用户通过自然语言对话驱动代码生成、修改与实时预览。

A browser-based AI coding playground — write React apps by chatting with an AI assistant, with live preview and in-browser compilation.

## 技术栈 / Tech Stack

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 + SWC |
| 路由 | React Router 7 |
| 状态管理 | Zustand + React Context |
| UI 组件库 | Ant Design 6 |
| 代码编辑器 | Monaco Editor |
| 浏览器编译 | @swc/wasm-web + TypeScript ATA |
| Markdown | react-markdown + remark-gfm |
| 样式方案 | SCSS Modules |
| 后端框架 | NestJS 11 |
| 数据库 | MySQL + TypeORM |
| 认证 | Passport + JWT |
| AI 接入 | LangChain + DeepSeek API |
| API 文档 | Swagger |
| 包管理 | pnpm workspace |

## 快速开始 / Quick Start

### 环境要求

- Node.js >= 18
- pnpm >= 10
- MySQL

### 安装与运行

```bash
# 1. 安装依赖
pnpm install

# 2. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS react_ai_playground CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 配置环境变量（参考下方配置说明）
cp apps/backend/.env.example apps/backend/.env
# 编辑 apps/backend/.env，填入你的 DeepSeek API Key 和数据库连接信息

# 4. 启动开发环境（前后端同时启动）
pnpm dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000
- Swagger 文档：http://localhost:3000/api

## 项目结构 / Project Structure

```
react-ai-playground/
├── apps/
│   ├── frontend/                    # React 19 + Vite 7 前端
│   │   └── src/
│   │       ├── main.tsx             # 应用入口
│   │       ├── router/              # 路由配置
│   │       ├── components/          # 共享组件（AuthRoute 等）
│   │       ├── apis/                # API 请求封装
│   │       ├── store/               # Zustand 状态（chatStore, userStore）
│   │       ├── utils/               # 工具函数（request, token）
│   │       ├── login/               # 登录页
│   │       └── ReactAiPlayground/   # 核心 AI 编程工作台
│   │           ├── AIPlaygroundContext.tsx  # 文件工作区上下文
│   │           ├── files.ts                 # 初始模板文件
│   │           └── components/
│   │               ├── ChatComponent/  # AI 聊天面板（流式 SSE、代码提取）
│   │               ├── CodeEditor/     # Monaco 编辑器 + 文件标签
│   │               ├── Preview/        # 浏览器内编译预览
│   │               └── Header/         # 顶部导航栏
│   │
│   └── backend/                     # NestJS 11 后端
│       └── src/
│           ├── main.ts              # 应用启动入口
│           ├── config/              # 配置中心
│           ├── common/              # 通用模块（Result, filter）
│           ├── auth/                # 认证模块（JWT + Passport）
│           ├── user/                # 用户模块（登录、提示规则）
│           └── chat/                # 聊天模块（SSE 流式、会话管理、Prompt 构建）
│               ├── entities/        # 会话、消息实体
│               ├── prompts/         # AI Prompt 模板
│               ├── config/          # LangChain 模型配置
│               └── profile-synthesis/  # 用户画像合成
│
├── package.json                     # 根工作区脚本
├── pnpm-workspace.yaml             # pnpm 工作区配置
└── CLAUDE.md                        # AI 协作规则
```

## 功能特性 / Features

### 浏览器内 AI 编程工作台
- **代码编辑器**：基于 Monaco Editor，支持多文件标签管理、TypeScript 语法高亮与智能提示。
- **实时预览**：通过 Web Worker + SWC WASM 在浏览器内编译 React/TypeScript 代码，iframe 沙箱渲染预览结果。
- **AI 对话编程**：通过自然语言描述需求，AI 自动生成或修改代码，代码块自动提取到文件工作区。
- **流式响应**：基于 SSE 的实时流式输出，逐字渲染 AI 回复。

### 智能对话系统
- **上下文感知**：选中文件自动作为对话上下文发送给 AI。
- **代码差异展示**：AI 修改代码时展示可视化的代码差异对比。
- **对话历史**：多轮对话支持，会话管理（新建、切换、删除）。
- **对话记忆**：长时间对话自动摘要，保持上下文连贯性。
- **用户画像合成**：从对话中提取用户偏好，个性化 AI 响应。

### 工作空间管理
- **扁平文件系统**：浏览器内存中的文件管理，支持新增、重命名、删除文件。
- **持久化**：文件状态通过 URL hash 压缩编码，支持刷新恢复；同时支持服务端持久化。
- **文件导出**：支持 ZIP 下载整个工作区。

### 用户系统
- JWT 认证登录。
- 自定义提示词规则（Prompt Rules），个性化 AI 行为。
- Swagger API 文档。

## 配置说明 / Configuration

### 环境变量（`apps/backend/.env`）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | MySQL 主机 |
| `DB_PORT` | MySQL 端口 |
| `DB_USERNAME` | 数据库用户名 |
| `DB_PASSWORD` | 数据库密码 |
| `DB_DATABASE` | 数据库名 |
| `DB_SYNC` | 自动同步表结构（开发用） |
| `JWT_SECRET` | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | Token 过期时间 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | 模型名称 |



## 常用命令 / Commands

```bash
# 开发
pnpm dev            # 同时启动前后端
pnpm dev:server     # 仅启动后端
pnpm dev:client     # 仅启动前端

# 构建与检查
pnpm build          # 全量构建
pnpm lint           # 全量代码检查
pnpm test           # 运行测试

# 清理
pnpm clean          # 清理 dist 和 node_modules
```


