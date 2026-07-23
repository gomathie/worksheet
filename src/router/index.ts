import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    {
      path: '/',
      name: 'entries',
      component: () => import('../views/EntriesView.vue'),
      meta: { auth: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { auth: true, right: 'view_dashboard' },
    },
    {
      path: '/report',
      name: 'report',
      component: () => import('../views/ReportView.vue'),
      meta: { auth: true, right: 'view_reports' },
    },
    {
      path: '/employees',
      name: 'employees',
      component: () => import('../views/EmployeesView.vue'),
      meta: { auth: true, admin: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { auth: true, admin: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    try {
      await auth.fetchMe()
    } catch {
      auth.loaded = true
    }
  }
  if (to.meta.auth && !auth.user) return { name: 'login' }
  if (to.meta.admin && !auth.isAdmin) return { name: 'entries' }
  if (
    to.meta.right &&
    !auth.rights[to.meta.right as keyof typeof auth.rights]
  ) {
    return { name: 'entries' }
  }
  if (to.name === 'login' && auth.user) return { name: 'entries' }
  return true
})

export default router
