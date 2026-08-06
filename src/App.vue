<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { useAuthStore } from './stores/auth'
import NotificationBell from './components/NotificationBell.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// Which nav section (if any) the current route belongs to. Drives both the
// top-level pill's highlight and whether that section's row of page buttons
// is shown underneath — no dropdown/overlay, just a second nav row in flow.
const reportsActive = computed(() =>
  ['report', 'trends', 'absences', 'activity'].includes(String(route.name)),
)
// Payments, Payslip, and everything expense-related all move money —
// grouped under one "Finance" section rather than splitting Pay/Expenses.
const financeActive = computed(() =>
  [
    'payments',
    'payslip',
    'expenses',
    'expense-new',
    'expense-detail',
    'expense-edit',
    'expense-pack',
    'expense-approvals',
    'expense-finance',
    'expense-reports',
    'petty-cash',
  ].includes(String(route.name)),
)
const adminActive = computed(() =>
  ['employees', 'settings'].includes(String(route.name)),
)
// Where the "Reports" pill itself points — Trends and Absences are always
// visible so they're a safe fallback for anyone without the Reports right.
const reportsHome = computed(() => (auth.rights.view_reports ? 'report' : 'trends'))

// Expense reporting is open to anyone who can see beyond their own vouchers.
const canSeeExpenseReports = computed(
  () =>
    auth.isAdmin || auth.rights.record_expenses || auth.rights.review_expenses,
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
      <!-- The masthead doubles as the way home. On the login screen the route
           guard bounces it straight back, so it is harmless there. -->
      <RouterLink
        :to="{ name: 'entries' }"
        class="flex items-center gap-3 hover:opacity-80"
        aria-label="OpenSignal Ledger — go to time entry"
      >
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
      </RouterLink>
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
      <!-- Fifteen possible destinations, flat, buried the page content on a
           phone and wrapped to several rows on desktop too. The top row pins
           Time Entry/Dashboard and one entry pill per section (Reports,
           Finance, Admin); whichever section the current page belongs to
           gets a second row of its own page buttons underneath \u2014 no
           dropdown/overlay, everything stays in the page flow. -->
      <button
        class="btn flex w-full items-center justify-between md:hidden"
        :aria-expanded="navOpen"
        @click="navOpen = !navOpen"
      >
        <span>Menu</span>
        <span class="text-muted">{{ navOpen ? '\u25b4' : '\u25be' }}</span>
      </button>

      <div :class="navOpen ? 'mt-2 block' : 'hidden md:block'">
        <div
          class="flex flex-col gap-1.5 md:flex-row md:flex-wrap md:items-center [&>a]:w-full md:[&>a]:w-auto"
        >
          <RouterLink
            :to="{ name: 'entries' }"
            class="btn"
            active-class="btn-solid"
            @click="navOpen = false"
            >Time Entry</RouterLink
          >
          <RouterLink
            v-if="auth.rights.view_dashboard"
            :to="{ name: 'dashboard' }"
            class="btn"
            active-class="btn-solid"
            @click="navOpen = false"
            >Dashboard</RouterLink
          >
          <RouterLink
            :to="{ name: reportsHome }"
            class="btn"
            :class="{ 'btn-solid': reportsActive }"
            @click="navOpen = false"
            >Reports</RouterLink
          >
          <RouterLink
            :to="{ name: 'payments' }"
            class="btn"
            :class="{ 'btn-solid': financeActive }"
            @click="navOpen = false"
            >Finance</RouterLink
          >
          <RouterLink
            v-if="auth.isAdmin"
            :to="{ name: 'employees' }"
            class="btn"
            :class="{ 'btn-solid': adminActive }"
            @click="navOpen = false"
            >Admin</RouterLink
          >
        </div>

        <!-- Reports section pages -->
        <div
          v-if="reportsActive"
          class="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 md:flex-row md:flex-wrap [&>a]:w-full md:[&>a]:w-auto"
        >
          <RouterLink
            v-if="auth.rights.view_reports"
            :to="{ name: 'report' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Monthly Report</RouterLink
          >
          <RouterLink
            :to="{ name: 'trends' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Trends</RouterLink
          >
          <RouterLink
            :to="{ name: 'absences' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Absences</RouterLink
          >
          <RouterLink
            v-if="auth.isAdmin"
            :to="{ name: 'activity' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Activity</RouterLink
          >
        </div>

        <!-- Finance section pages -->
        <div
          v-if="financeActive"
          class="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 md:flex-row md:flex-wrap [&>a]:w-full md:[&>a]:w-auto"
        >
          <RouterLink
            :to="{ name: 'payments' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Payments</RouterLink
          >
          <RouterLink
            v-if="auth.rights.view_payslip"
            :to="{ name: 'payslip' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Payslip</RouterLink
          >
          <RouterLink
            :to="{ name: 'expenses' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Expenses</RouterLink
          >
          <RouterLink
            v-if="auth.rights.use_petty_cash || auth.isAdmin"
            :to="{ name: 'petty-cash' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Petty Cash</RouterLink
          >
          <RouterLink
            v-if="
              auth.rights.review_expenses ||
              canApproveExpenses ||
              auth.canApproveUsers ||
              auth.rights.add_users
            "
            :to="{ name: 'expense-approvals' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Approvals</RouterLink
          >
          <RouterLink
            v-if="auth.rights.record_expenses"
            :to="{ name: 'expense-finance' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >To Record</RouterLink
          >
          <RouterLink
            v-if="canSeeExpenseReports"
            :to="{ name: 'expense-reports' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Expense Reports</RouterLink
          >
        </div>

        <!-- Admin section pages -->
        <div
          v-if="adminActive && auth.isAdmin"
          class="mt-2 flex flex-col gap-1.5 border-t border-line pt-2 md:flex-row md:flex-wrap [&>a]:w-full md:[&>a]:w-auto"
        >
          <RouterLink
            :to="{ name: 'employees' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Employees</RouterLink
          >
          <RouterLink
            :to="{ name: 'settings' }"
            class="btn btn-sm"
            active-class="btn-solid"
            @click="navOpen = false"
            >Settings</RouterLink
          >
        </div>
      </div>
    </nav>

    <RouterView />
  </div>
</template>
