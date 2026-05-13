/**
 * @file src/notFound/index.tsx
 * @description 404 页面组件
 * 当用户访问不存在的路由时显示，提供返回首页的按钮
 * @author React AI Playground
 */

// React 核心库
import React from 'react';

// Ant Design 组件
import { Button, Result } from 'antd';

// React Router - 导航
import { useNavigate } from 'react-router';

// 样式文件
import styles from './index.module.scss';

/**
 * 404 页面组件
 * 显示友好的页面不存在提示，并提供返回首页的入口
 */
const NotFound: React.FC = () => {
    // 路由导航钩子
    const navigate = useNavigate();

    return (
        <div className={styles.notFoundPage}>
            <Result
                status="404"
                title="404"
                subTitle="抱歉，您访问的页面不存在或已被移除。"
                extra={
                    <Button
                        type="primary"
                        size="large"
                        onClick={() => navigate('/index')}
                        className={styles.backBtn}
                    >
                        返回首页
                    </Button>
                }
            />
        </div>
    );
};

export default NotFound;
