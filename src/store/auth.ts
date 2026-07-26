/**
 * 认证状态管理 — Zustand store
 *
 * 职责：
 *   - 持久化 token 到 localStorage
 *   - 维护当前用户信息
 *   - 提供 login/register/logout 方法
 *   - 提供带 JWT 的 fetch 封装（authFetch）
 */
import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

interface AuthStore {
  user: AuthUser | null
  token: string | null
  loading: boolean

  setAuth: (user: AuthUser, token: string) => void
  logout: () => void
  /** 启动时从 localStorage 恢复会话并校验 */
  restoreSession: () => Promise<void>
}

const TOKEN_KEY = 'omnivision_token'

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  setAuth: (user, token) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ user, token, loading: false })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, token: null, loading: false })
  },

  restoreSession: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ loading: false })
      return
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY)
        set({ user: null, token: null, loading: false })
        return
      }
      const data = await res.json()
      if (data.success && data.user) {
        set({ user: data.user, token, loading: false })
      } else {
        localStorage.removeItem(TOKEN_KEY)
        set({ user: null, token: null, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },
}))

/**
 * 带 JWT 的 fetch 封装
 * 自动注入 Authorization header，token 过期时自动登出
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(input, { ...init, headers })

  // 401 → 清除登录态
  if (res.status === 401) {
    useAuthStore.getState().logout()
  }

  return res
}
