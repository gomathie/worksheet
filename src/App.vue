<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'
import { useAuthStore } from './stores/auth'
import NotificationBell from './components/NotificationBell.vue'

const auth = useAuthStore()
const router = useRouter()

// Expense reporting is open to anyone who can see beyond their own vouchers.
const canSeeExpenseReports = computed(
  () =>
    auth.isAdmin || auth.rights.finance_expenses || auth.rights.review_expenses,
)

// Final approval needs the admin role *and* the explicitly granted right.
const canApproveExpenses = computed(
  () => auth.isAdmin && auth.rights.approve_expenses,
)

const menuOpen = ref(false)
// Mobile nav disclosure; irrelevant at md and above, where the row is shown.
const navOpen = ref(false)

async function signOut() {
  menuOpen.value = false
  await auth.logout()
  router.push({ name: 'login' })
}

const showPw = ref(false)

function openPassword() {
  menuOpen.value = false
  showPw.value = true
  pwError.value = ''
  pwDone.value = false
  pwCurrent.value = ''
  pwNew.value = ''
}
const pwCurrent = ref('')
const pwNew = ref('')
const pwBusy = ref(false)
const pwError = ref('')
const pwDone = ref(false)

function togglePw() {
  showPw.value = !showPw.value
  pwError.value = ''
  pwDone.value = false
  pwCurrent.value = ''
  pwNew.value = ''
}

async function changePassword() {
  pwError.value = ''
  pwDone.value = false
  pwBusy.value = true
  try {
    await api('/api/me/password', {
      method: 'POST',
      json: { current_password: pwCurrent.value, new_password: pwNew.value },
    })
    pwDone.value = true
    pwCurrent.value = ''
    pwNew.value = ''
  } catch (e) {
    pwError.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    pwBusy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-[1180px] px-5 pb-16">
    <header
      class="no-print flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pt-7 pb-4"
    >
      <div class="flex items-center gap-3">
        <div
          class="display flex h-10 w-10 -rotate-6 items-center justify-center rounded-full border-2 border-ink text-[15px]"
        >
          LG
        </div>
        <div>
          <h1 class="display text-3xl leading-none">OPENSIGNAL Ledger</h1>
          <p class="mt-0.5 text-xs tracking-[0.12em] text-muted uppercase">
            Team Timesheet &amp; Tracker
          </p>
        </div>
      </div>
      <div v-if="auth.user" class="flex items-center gap-2 text-sm">
        <NotificationBell />
        <div class="relative">
        <button
          class="btn btn-sm flex items-center gap-2"
          @click="menuOpen = !menuOpen"
        >
          <span>Account</span>
          <span class="text-muted">▾</span>
        </button>

        <!-- click-away backdrop -->
        <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />

        <div
          v-if="menuOpen"
          class="panel absolute right-0 z-20 mt-1 w-52 !p-1 text-sm shadow-lg"
        >
          <div class="border-b border-line px-3 py-2">
            <p class="font-medium">{{ auth.user.name }}</p>
            <p class="text-xs tracking-wider text-muted uppercase">
              {{ auth.user.role }}
            </p>
          </div>
          <button
            class="block w-full rounded px-3 py-2 text-left hover:bg-teal-soft"
            @click="openPassword"
          >
            Change password
          </button>
          <button
            class="block w-full rounded px-3 py-2 text-left hover:bg-teal-soft"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
        </div>
      </div>
    </header>

    <div v-if="auth.user && showPw" class="no-print mt-4 max-w-md">
      <form class="panel" @submit.prevent="changePassword">
        <h2 class="display mb-3 text-xl">Change your password</h2>
        <label class="field-label" for="pw-cur">Current password</label>
        <input
          id="pw-cur"
          v-model="pwCurrent"
          type="password"
          required
          autocomplete="current-password"
          class="field-input mb-3"
        />
        <label class="field-label" for="pw-new">New password (min. 8 characters)</label>
        <input
          id="pw-new"
          v-model="pwNew"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="field-input mb-4"
        />
        <div class="flex items-center gap-2">
          <button class="btn btn-solid btn-sm" :disabled="pwBusy">
            {{ pwBusy ? 'Saving…' : 'Update password' }}
          </button>
          <button type="button" class="btn btn-sm" @click="togglePw">Close</button>
          <span v-if="pwDone" class="text-sm text-teal">Password updated.</span>
        </div>
        <p
          v-if="pwError"
          class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red"
        >
          {{ pwError }}
        </p>
      </form>
    </div>

    <nav v-if="auth.user" class="no-print my-5">
      <!-- Thirteen destinations wrap to seven rows on a phone, burying the
           page content. Collapse to a toggle below md; unchanged above it. -->
      <button
        class="btn flex w-full items-center justify-between md:hidden"
        :aria-expanded="navOpen"
        @click="navOpen = !navOpen"
      >
        <span>Menu</span>
        <span class="text-muted">{{ navOpen ? '\u25b4' : '\u25be' }}</span>
      </button>

      <div
        class="gap-1.5 md:flex md:flex-wrap [&>a]:w-full md:[&>a]:w-auto"
        :class="navOpen ? 'mt-2 flex flex-col' : 'hidden'"
        @click="navOpen = false"
      >
      <RouterLink :to="{ name: 'entries' }" class="btn" active-class="btn-solid"
        >Time Entry</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_dashboard"
        :to="{ name: 'dashboard' }"
        class="btn"
        active-class="btn-solid"
        >Dashboard</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_reports"
        :to="{ name: 'report' }"
        class="btn"
        active-class="btn-solid"
        >Monthly Report</RouterLink
      >
      <RouterLink :to="{ name: 'payments' }" class="btn" active-class="btn-solid"
        >Payments</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_payslip"
        :to="{ name: 'payslip' }"
        class="btn"
        active-class="btn-solid"
        >Payslip</RouterLink
      >
      <RouterLink :to="{ name: 'trends' }" class="btn" active-class="btn-solid"
        >Trends</RouterLink
      >
      <RouterLink :to="{ name: 'absences' }" class="btn" active-class="btn-solid"
        >Absences</RouterLink
      >
      <RouterLink :to="{ name: 'expenses' }" class="btn" active-class="btn-solid"
        >Expenses</RouterLink
      >
      <RouterLink
        v-if="
          auth.rights.review_expenses ||
          canApproveExpenses ||
          auth.canApproveUsers ||
          auth.rights.add_users
        "
        :to="{ name: 'expense-approvals' }"
        class="btn"
        active-class="btn-solid"
        >Approvals</RouterLink
      >
      <RouterLink
        v-if="auth.rights.finance_expenses"
        :to="{ name: 'expense-finance' }"
        class="btn"
        active-class="btn-solid"
        >Finance</RouterLink
      >
      <RouterLink
        v-if="canSeeExpenseReports"
        :to="{ name: 'expense-reports' }"
        class="btn"
        active-class="btn-solid"
        >Expense Reports</RouterLink
      >
      <template v-if="auth.isAdmin">
        <RouterLink :to="{ name: 'employees' }" class="btn" active-class="btn-solid"
          >Employees</RouterLink
        >
        <RouterLink :to="{ name: 'settings' }" class="btn" active-class="btn-solid"
          >Settings</RouterLink
        >
        <RouterLink :to="{ name: 'activity' }" class="btn" active-class="btn-solid"
          >Activity</RouterLink
        >
      </template>
      </div>
    </nav>

    <RouterView />
  </div>
</template>
