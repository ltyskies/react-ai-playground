/**
 * @file app.module.ts
 * @description 应用程序根模块，负责全局配置和模块导入
 * @module 根模块
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import configuration from './config/configuration';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 应用程序根模块
 * @description 整合所有功能模块，配置数据库连接和全局配置
 */
@Module({
  imports: [
    // 导入业务模块
    UserModule,
    JwtModule,
    ChatModule,
    AuthModule,

    // 1. 全局配置模块
    ConfigModule.forRoot({
      isGlobal: true, // 设置为全局模块，所有模块均可使用
      load: [configuration], // 加载自定义配置文件
    }),

    // 2. 异步加载数据库模块
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], // 导入配置模块以获取数据库配置
      inject: [ConfigService], // 注入 ConfigService
      useFactory: (configService: ConfigService) => ({
        type: 'mysql', // 数据库类型为 MySQL
        host: configService.get<string>('database.host'), // 数据库主机地址
        port: configService.get<number>('database.port'), // 数据库端口
        username: configService.get<string>('database.username'), // 数据库用户名
        password: configService.get<string>('database.password'), // 数据库密码
        database: configService.get<string>('database.database'), // 数据库名称
        autoLoadEntities: true, // 自动加载实体
        synchronize: configService.get<boolean>('database.synchronize'), // 是否自动同步数据库结构
        // 连接策略配置
        retryDelay: 500, // 重试延迟 500ms
        retryAttempts: 10, // 最大重试次数 10 次
      }),
    }),
  ],
  controllers: [AppController], // 注册根控制器
  providers: [AppService], // 注册根服务
})
export class AppModule {}
