/**
 * @file src/login/index.tsx
 * @description 用户登录页面组件
 * 提供登录表单，验证用户身份，登录成功后跳转到主页面
 * @author React AI Playground
 */

// React 核心库
import React from 'react';

// Ant Design 组件
import type { FormProps } from 'antd';
import { Button, Form, Input, Card, message } from 'antd';

// 项目内部模块 - API 接口
import { loginAPI } from '@/apis/user';

// React Router - 导航
import { useNavigate } from 'react-router';

// 项目内部模块 - Token 管理
import { setToken } from '@/utils/token';

// 样式文件
import styles from '@/login/index.module.scss';

// 项目内部模块 - 用户状态管理
import useUserStore from '@/store/userStore';

/**
 * 登录表单字段类型
 * @property email - 邮箱地址
 * @property password - 登录密码
 */
type FieldType = {
    email: string;
    password: string;
};

/**
 * 登录响应数据接口
 * @property code - 响应状态码，200 表示成功
 * @property data - 响应数据，包含 token、id、email 等
 */
interface LoginResponse {
    code: number;
    data: {
        token: string;
        id: number;
        email: string;
        createdAt: string;
    };
}

/**
 * 登录页面组件
 * 提供用户登录功能，包含表单验证、登录请求、状态管理
 */
const Login: React.FC = () => {
    // 路由导航钩子
    const navigate = useNavigate();
    // Ant Design 表单实例
    const [form] = Form.useForm();
    // 用户状态管理
    const { setUserId } = useUserStore();

    /**
     * 表单提交处理函数
     * 发送登录请求，处理登录结果
     * @param values - 表单数据
     */
    const onFinish: FormProps<FieldType>['onFinish'] = async (values: FieldType) => {
        try {
            // 发送登录请求
            const res: LoginResponse | any = await loginAPI(values);

            // 登录成功
            if (res.code === 200) {
                message.success('登录成功，正在跳转...');
                console.log('登录成功，返回数据：', res.data);
                // 保存 Token 到本地存储
                setToken(res.data.token);
                // 保存用户ID到状态管理
                setUserId(res.data.id);
                // 延迟跳转到主页面
                setTimeout(() => {
                    navigate('/index');
                }, 800);
            } else {
                // 登录失败，显示错误信息
                message.error(res.data || '登录失败');
            }
        } catch (err) {
            // 网络错误或服务器异常
            console.error(err);
            message.error('网络错误或服务器异常');
        }
    };

    return (
        <div className={styles.loginPage}>
            <div className={styles.loginOverlay}>
                <Card className={styles.loginCard} bordered={false}>
                    {/* 登录页面头部 */}
                    <div className={styles.loginHeader}>
                        <h1 className={styles.loginTitle}>React AI Playground</h1>
                        <p className={styles.loginSubtitle}>请登录您的账号</p>
                    </div>

                    {/* 登录表单 */}
                    <Form
                        form={form}
                        name="login_form"
                        layout="vertical"
                        onFinish={onFinish}
                        autoComplete="off"
                        size="large"
                    >
                        {/* 邮箱输入项 */}
                        <Form.Item<FieldType>
                            label="邮箱地址"
                            name="email"
                            rules={[
                                { required: true, message: '请输入邮箱!' },
                                { type: 'email', message: '请输入有效的邮箱格式!' }
                            ]}
                        >
                            <Input placeholder="admin@email.com" />
                        </Form.Item>

                        {/* 密码输入项 */}
                        <Form.Item<FieldType>
                            label="密码"
                            name="password"
                            rules={[{ required: true, message: '请输入密码!' }]}
                        >
                            <Input.Password placeholder="请输入密码" />
                        </Form.Item>

                        {/* 提交按钮 */}
                        <Form.Item>
                            <Button type="primary" htmlType="submit" block className={styles.loginButton}>
                                立即登录
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>
            </div>
        </div>
    );
};

export default Login;
