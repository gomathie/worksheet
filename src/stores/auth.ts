import { defineStore } from 'pinia'
import { api } from '../api'
import type { Me, Rights } from '../types'

const NO_RIGHTS: Rights = {
  add_entries: false,
  edit_entries: false,
  delete_entries: false,
  view_dashboard: false,
  view_reports: false,
  view_remuneration: false,
  view_payslip: false,
  view_points: false,
  log_leave: false,
  direct_counts: false,
  add_expenses: false,
  review_expenses: false,
  finance_expenses: false,
  approve_expenses: false,
  add_users: false,
  approve_users: false,
  use_petty_cash: false,
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as Me | null,
    loaded: false,
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin',
    isManager: (s) => s.user?.role === 'manager',
    // Both approval authorities require the admin role in addition to the
    // explicitly granted right.
    canApproveExpenses: (s) =>
      s.user?.role === 'admin' && Boolean(s.user?.rights.approve_expenses),
    canApproveUsers: (s) =>
      s.user?.role === 'admin' && Boolean(s.user?.rights.approve_users),
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
