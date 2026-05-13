# React AI Playground Client

一个基于 React + TypeScript + Vite 构建的 AI 驱动在线代码开发环境，集成了代码编辑器、实时预览和 AI 聊天助手、AI增删改查代码、查看diff树、一键应用与撤回代码等功能。

## 功能特性

- **代码编辑器**: 基于 Monaco Editor，支持语法高亮、代码补全、类型提示
- **实时预览**: 即时预览代码运行效果，支持 React 组件热更新
- **AI 聊天助手**: 集成 AI 对话功能，辅助代码编写和问题解答
- **文件管理**: 支持多文件编辑和管理
- **代码变更面板**: 可视化展示代码差异和变更
- **响应式布局**: 可拖拽分栏，灵活调整各面板大小

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 7
- **UI 组件库**: Ant Design 6
- **代码编辑器**: Monaco Editor
- **状态管理**: Zustand
- **路由**: React Router 7
- **样式**: SCSS + CSS Modules
- **代码转换**: Babel Standalone

## 安装

```bash
# 克隆项目后，安装依赖
pnpm install

# 或使用 npm
npm install

# 或使用 yarn
yarn install
```

## 开发

```bash
# 启动开发服务器
pnpm dev

# 或使用 npm
npm run dev
```

开发服务器启动后，访问 `http://localhost:5173` 即可使用。

## 构建

```bash
# 构建生产版本
pnpm build

# 或使用 npm
npm run build
```

构建产物将输出到 `dist` 目录。

## 预览生产构建

```bash
# 本地预览生产构建
pnpm preview

# 或使用 npm
npm run preview
```

## 代码检查

```bash
# 运行 ESLint 检查
pnpm lint

# 或使用 npm
npm run lint
```

## 项目结构

```
src/
├── ReactAiPlayground/          # 主应用模块
│   ├── components/         # 组件目录
│   │   ├── ChatComponent/  # AI 聊天面板
│   │   ├── CodeChangesPanel/  # 代码变更面板
│   │   ├── CodeEditor/     # 代码编辑器
│   │   ├── Header/         # 顶部导航栏
│   │   ├── Message/        # 消息组件
│   │   ├── Preview/        # 代码预览
│   │   └── Skeleton/       # 骨架屏组件
│   ├── template/           # 模板文件
│   ├── AIPlaygroundContext.tsx # 全局 Context
│   ├── files.ts            # 文件管理
│   ├── index.scss          # 样式文件
│   ├── index.tsx           # 主组件
│   └── utils.ts            # 工具函数
├── apis/                   # API 接口
├── components/             # 通用组件
├── login/                  # 登录页面
├── notFound/               # 404 页面
├── router/                 # 路由配置
├── store/                  # 状态管理
└── utils/                  # 工具函数
```

## 使用说明

1. **启动应用**: 运行 `pnpm dev` 启动开发服务器
2. **创建对话**: 应用会自动创建新的 AI 对话会话
3. **编写代码**: 在左侧代码编辑器中编写 React 代码
4. **实时预览**: 中间面板会实时显示代码运行效果
5. **AI 辅助**: 在右侧聊天面板与 AI 对话，获取代码帮助
6. **调整布局**: 拖拽面板分隔线调整各区域大小

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge

## 许可证

[MIT](LICENSE)
