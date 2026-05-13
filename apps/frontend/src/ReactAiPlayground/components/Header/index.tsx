/**
 * @file src/ReactAiPlayground/components/Header/index.tsx
 * @description 顶部导航栏组件
 * @author React AI Playground
 */

import { useContext } from 'react';

// 第三方库 - 剪贴板复制
import copy from 'copy-to-clipboard';

// Ant Design 图标
import {
    DownloadOutlined,
    LogoutOutlined,
    PlusOutlined,
    ShareAltOutlined
} from '@ant-design/icons';

// Ant Design 组件
import { Popconfirm, message } from 'antd';

// 项目内部资源
import logoSvg from './icons/logo.svg';

// 样式文件
import styles from './index.module.scss';

// 项目内部模块
import { AIPlaygroundContext } from '@/ReactAiPlayground/AIPlaygroundContext';
import { downloadFiles } from '@/ReactAiPlayground/utils';
import { removeToken } from '@/utils/token';

/**
 * Header 组件属性接口
 */
interface HeaderProps {
    /** 是否正在执行会话操作（创建/切换） */
    actionLoading: boolean
    /** 创建新会话回调 */
    onCreateConversation: () => void | Promise<void>
    /** 打开用户中心回调 */
    onOpenUserCenter: () => void | Promise<void>
}

/**
 * 顶部导航栏组件
 * @description 提供 Logo、AI 面板开关、新建会话、分享链接、下载代码、用户中心和退出登录等入口
 */
export default function Header(props: HeaderProps) {
    const {
        actionLoading,
        onCreateConversation,
        onOpenUserCenter,
    } = props;

    const { isShow, setIsShow, files } = useContext(AIPlaygroundContext);

    const handleLogout = () => {
        removeToken();
        message.success('Logged out');
        window.location.reload();
    };

    return (
        <div className={styles.header}>
            <div className={styles.logo}>
                <img alt='logo' src={logoSvg} />
                <span>React AI Playground</span>
                <span
                    onClick={() => setIsShow(!isShow)}
                    className={`${styles.aiButton} ${isShow ? styles.active : ''}`}
                >
                    AI Panel
                </span>
            </div>

            <div className={styles.links}>
                <button
                    type="button"
                    className={styles.iconButton}
                    title='New conversation'
                    onClick={() => void onCreateConversation()}
                    disabled={actionLoading}
                >
                    <PlusOutlined />
                </button>

                <button
                    type="button"
                    className={styles.iconButton}
                    title='Share'
                    onClick={() => {
                        copy(window.location.href)
                        message.success('Link copied')
                    }}
                >
                    <ShareAltOutlined />
                </button>

                <button
                    type="button"
                    className={styles.iconButton}
                    title='Download code'
                    onClick={async () => {
                        await downloadFiles(files);
                        message.success('Download ready')
                    }}
                >
                    <DownloadOutlined />
                </button>

                <button
                    type="button"
                    className={styles.labelButton}
                    onClick={() => void onOpenUserCenter()}
                    disabled={actionLoading}
                >
                    用户中心
                </button>

                <Popconfirm
                    title="Sign out"
                    description="Do you want to sign out?"
                    onConfirm={handleLogout}
                    okText="Yes"
                    cancelText="No"
                    placement="bottomRight"
                    arrow={false}
                >
                    <button
                        type="button"
                        className={styles.iconButton}
                        title='Sign out'
                    >
                        <LogoutOutlined />
                    </button>
                </Popconfirm>
            </div>
        </div>
    )
}
