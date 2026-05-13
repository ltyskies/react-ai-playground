/**
 * @file src/store/userStore.tsx
 * @description 用户状态管理模块
 * 使用 Zustand + Immer 管理用户相关信息（如用户ID）
 * @author React AI Playground
 */

// 状态管理库 - Zustand
import { create } from 'zustand'

// 不可变数据更新中间件
import { immer } from 'zustand/middleware/immer'

/**
 * 用户状态接口
 * @property id - 当前登录用户的唯一标识
 * @property setUserId - 设置用户ID的方法
 */
interface User {
    id: number;
    setUserId: (id: number) => void;
}

/**
 * 创建用户状态 Store
 * 使用 Immer 中间件支持直接修改状态对象
 * 
 * 状态说明：
 * - id: 用户ID，默认为 1（未登录状态）
 * - setUserId: 更新用户ID的方法
 */
const useUserStore = create<User>()(immer((set) => ({
    // 默认用户ID
    id: 1,
    /**
     * 设置用户ID
     * @param id - 新的用户ID
     */
    setUserId: (id: number) => set((state) => {
        // 使用 Immer 直接修改状态
        state.id = id;
    }),
})))

export default useUserStore;
