import { defineStore } from 'pinia'
import { api } from '../api'
import type { Me, Rights } from '../types'

const NO_RIGHTS: Rights = {
  edit_entries: false,
  view_dashboard: false,
  view_reports: false,
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as Me | null,
    loaded: false,
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin',
    rights: (s): Rights => s.user?.rights ?? NO_RIGHTS,
  },
  actions: {
    async fetchMe() {
      this.user = await api<Me | null>('/api/me')
      this.loaded = true
    },
    async login(username: string, password: string) {
      await api('/api/auth/login', { method: 'POST', json: { username, password } })
      await this.fetchMe()
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' })
      this.user = null
    },
  },
})
