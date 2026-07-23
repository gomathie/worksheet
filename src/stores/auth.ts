import { defineStore } from 'pinia'
import { api } from '../api'
import type { Me } from '../types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as Me | null,
    loaded: false,
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    async fetchMe() {
      this.user = await api<Me | null>('/api/me')
      this.loaded = true
    },
    async login(email: string): Promise<string | undefined> {
      const res = await api<{ ok: boolean; code?: string }>('/api/auth/login', {
        method: 'POST',
        json: { email },
      })
      return res.code
    },
    async verify(email: string, code: string) {
      await api('/api/auth/verify', { method: 'POST', json: { email, code } })
      await this.fetchMe()
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' })
      this.user = null
    },
  },
})
