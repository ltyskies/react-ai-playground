# React AI Playground

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">
  基于 NestJS 的 AI 聊天后端服务，提供用户认证、AI 对话管理等功能
</p>

<p align="center">
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
</p>

## 项目介绍

React AI Playground 是一个基于 NestJS 框架开发的 AI 聊天后端服务，集成了 DeepSeek AI 大模型，为用户提供智能对话体验。

### 核心功能

- **用户认证系统**：支持用户注册、登录，基于 JWT 的身份验证
- **AI 对话管理**：支持创建会话、多轮对话、流式消息输出（SSE）
- **数据持久化**：使用 MySQL 数据库存储用户信息和对话历史
- **API 文档**：集成 Swagger 自动生成 API 文档

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | NestJS 11.x |
| 数据库 | MySQL + TypeORM |
| 认证 | JWT + Passport |
| AI 服务 | LangChain + DeepSeek API |
| API 文档 | Swagger |
| 测试 | Jest |

## 项目结构

```
src/
├── auth/          # 认证模块（JWT 策略、守卫）
├── chat/          # 聊天模块（对话服务、控制器、实体）
├── common/        # 公共工具（结果封装、异常过滤器）
├── config/        # 配置文件
├── user/          # 用户模块（注册、登录、用户实体）
├── app.*          # 根应用文件
└── main.ts        # 入口文件
```

## 环境要求

- Node.js >= 18.x
- pnpm >= 8.x
- MySQL >= 5.7

## 安装与配置

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件，配置以下环境变量：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=ai_chat_db

# JWT 配置
JWT_SECRET=your_jwt_secret_key

# DeepSeek AI 配置
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 3. 创建数据库

在 MySQL 中创建数据库：

```sql
CREATE DATABASE ai_chat_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 使用方法

### 开发模式

```bash
# 启动开发服务器（带热重载）
pnpm start:dev
```

服务启动后：
- API 服务地址：`http://localhost:3000`
- Swagger 文档地址：`http://localhost:3000/api`

### 生产模式

```bash
# 构建项目
pnpm build

# 启动生产服务器
pnpm start:prod
```

### 常用命令

```bash
# 代码格式化
pnpm format

# 代码检查与修复
pnpm lint

# 运行单元测试
pnpm test

# 运行测试（监听模式）
pnpm test:watch

# 生成测试覆盖率报告
pnpm test:cov

# 运行端到端测试
pnpm test:e2e
```

## API 接口说明

### 用户模块

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/user/register` | 用户注册 |
| POST | `/user/login` | 用户登录 |

### 聊天模块（需要认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/chat/conversation` | 创建新会话 |
| GET | `/chat/conversation` | 获取会话详情 |
| POST | `/chat/stream` | 流式消息对话（SSE） |

### 认证方式

所有聊天相关接口需要在请求头中携带 JWT Token：

```
Authorization: Bearer <your_jwt_token>
```

## 开发指南

### 添加新模块

1. 使用 NestJS CLI 生成模块：
```bash
npx nest g module <module-name>
npx nest g controller <module-name>
npx nest g service <module-name>
```

2. 在 `app.module.ts` 中导入新模块

### 数据库实体

定义实体后，TypeORM 会自动同步数据库结构（开发环境）：

```typescript
@Entity()
export class YourEntity {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
}
```

## 部署说明

### 环境变量配置

生产环境必须配置以下环境变量：

```env
# 数据库（生产环境）
DB_HOST=your_prod_db_host
DB_PORT=3306
DB_USERNAME=your_prod_db_user
DB_PASSWORD=your_prod_db_password
DB_DATABASE=ai_chat_db
DB_SYNC=false  # 生产环境建议关闭自动同步

# JWT
JWT_SECRET=your_strong_secret_key
JWT_EXPIRES_IN=3600s

# DeepSeek
DEEPSEEK_API_KEY=your_api_key
```

### Docker 部署（可选）

```dockerfile
# 构建镜像
docker build -t react-ai-playground .

# 运行容器
docker run -p 3000:3000 --env-file .env react-ai-playground
```

## 许可证

[MIT](LICENSE)

## 相关资源

- [NestJS 官方文档](https://docs.nestjs.com)
- [TypeORM 文档](https://typeorm.io)
- [DeepSeek API 文档](https://platform.deepseek.com)
