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
      path: '/payments',
      name: 'payments',
      component: () => import('../views/PaymentsView.vue'),
      meta: { auth: true },
    },
    {
      path: '/payslip',
      name: 'payslip',
      component: () => import('../views/PayslipView.vue'),
      meta: { auth: true, right: 'view_payslip' },
    },
    {
      path: '/trends',
      name: 'trends',
      component: () => import('../views/TrendsView.vue'),
      meta: { auth: true },
    },
    {
      path: '/absences',
      name: 'absences',
      component: () => import('../views/AbsencesView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses',
      name: 'expenses',
      component: () => import('../views/ExpensesView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses/new',
      name: 'expense-new',
      component: () => import('../views/ExpenseFormView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses/approvals',
      name: 'expense-approvals',
      component: () => import('../views/ExpenseApprovalsView.vue'),
      // Serves two audiences: managers reviewing their direct reports, and
      // approvers giving final approval. Either right opens the page.
      meta: {
        auth: true,
        anyRight: [
          'review_expenses',
          'approve_expenses',
          'approve_users',
          'add_users',
        ],
      },
    },
    {
      path: '/expenses/screening',
      name: 'expense-screening',
      component: () => import('../views/ExpenseScreeningView.vue'),
      meta: { auth: true, right: 'send_for_approval' },
    },
    {
      path: '/expenses/finance',
      name: 'expense-finance',
      component: () => import('../views/ExpenseFinanceView.vue'),
      meta: { auth: true, right: 'record_expenses' },
    },
    {
      path: '/expenses/pack',
      name: 'expense-pack',
      component: () => import('../views/ExpensePackView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses/reports',
      name: 'expense-reports',
      component: () => import('../views/ExpenseReportsView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses/:id',
      name: 'expense-detail',
      component: () => import('../views/ExpenseDetailView.vue'),
      meta: { auth: true },
    },
    {
      path: '/expenses/:id/edit',
      name: 'expense-edit',
      component: () => import('../views/ExpenseFormView.vue'),
      meta: { auth: true },
    },
    {
      path: '/petty-cash',
      name: 'petty-cash',
      component: () => import('../views/PettyCashView.vue'),
      meta: { auth: true },
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
    {
      path: '/activity',
      name: 'card-audit',
      component: () => import('../views/CardAuditView.vue'),
      meta: { auth: true, right: 'view_reports' },
    },
    {
      path: '/activity',
      name: 'activity',
      component: () => import('../views/AuditView.vue'),
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
  // anyRight: the page opens if the user holds at least one of them.
  const anyRight = to.meta.anyRight as (keyof typeof auth.rights)[] | undefined
  if (anyRight && !anyRight.some((r) => auth.rights[r])) {
    return { name: 'entries' }
  }
  if (to.name === 'login' && auth.user) return { name: 'entries' }
  return true
})

export default router
