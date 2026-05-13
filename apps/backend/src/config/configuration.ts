/**
 * @file configuration.ts
 * @description 应用程序配置文件，集中管理所有环境变量配置
 * @module 配置模块
 */

/**
 * 默认配置导出函数
 * @description 从环境变量读取配置，提供默认值
 * @returns 配置对象，包含数据库、AI 服务和 JWT 配置
 */
export default () => ({
  /**
   * 数据库配置
   */
  database: {
    /** 数据库类型，默认为 MySQL */
    type: process.env.DB_TYPE || 'mysql',
    /** 数据库主机地址，默认为 localhost */
    host: process.env.DB_HOST || 'localhost',
    /** 数据库端口，默认为 3306 */
    port: parseInt(process.env.DB_PORT || '3306', 10),
    /** 数据库用户名，默认为 root */
    username: process.env.DB_USERNAME || 'root',
    /** 数据库密码，默认为 123456 */
    password: process.env.DB_PASSWORD || '123456',
    /** 数据库名称，默认为 ai_chat_db */
    database: process.env.DB_DATABASE || 'ai_chat_db',
    /** 是否自动同步数据库结构，默认为 false */
    synchronize: process.env.DB_SYNC === 'true',
  },

  /**
   * AI 服务配置
   */
  ai: {
    /**
     * DeepSeek AI 配置
     */
    deepseek: {
      /** DeepSeek API 密钥，从环境变量读取 */
      apiKey: process.env.DEEPSEEK_API_KEY,
      /** DeepSeek API 基础 URL，默认为官方地址 */
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      /** 使用的模型名称，默认为 deepseek-chat */
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
  },

  /**
   * JWT 认证配置
   */
  jwt: {
    /** JWT 签名密钥，默认为 default_secret_key */
    secret: process.env.JWT_SECRET || 'default_secret_key',
    /** Token 过期时间，默认为 3600 秒 */
    expiresIn: process.env.JWT_EXPIRES_IN || '3600s',
  },
});
