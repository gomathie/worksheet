<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from './api'
import { useAuthStore } from './stores/auth'
import NotificationBell from './components/NotificationBell.vue'
import TaskDeadlineAlert from './components/TaskDeadlineAlert.vue'
import NewsPopup from './components/NewsPopup.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// Which nav section (if any) the current route belongs to. Drives both the
// top-level pill's highlight and whether that section's row of page buttons
// is shown underneath — no dropdown/overlay, just a second nav row in flow.
const reportsActive = computed(() =>
  ['report', 'trends', 'absences', 'card-audit', 'installations-report', 'activity'].includes(
    String(route.name),
  ),
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
    'expense-screening',
    'expense-finance',
    'expense-reports',
    'petty-cash',
  ].includes(String(route.name)),
)
const adminActive = computed(() =>
  ['employees', 'settings', 'notifications'].includes(String(route.name)),
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

// The primary nav row and each mini-tab strip scroll horizontally on mobile,
// so the active pill can land off-screen with nothing on screen to say which
// section you're in (worst case: "Admin", last in a six-item row). Scroll it
// into view — horizontally only — whenever the route changes, on every strip
// at once; a strip that isn't rendered for this route is just `null`.
const primaryNavEl = ref<HTMLElement | null>(null)
const reportsNavEl = ref<HTMLElement | null>(null)
const financeNavEl = ref<HTMLElement | null>(null)
const adminNavEl = ref<HTMLElement | null>(null)

function scrollActivePillsIntoView() {
  for (const el of [primaryNavEl.value, reportsNavEl.value, financeNavEl.value, adminNavEl.value]) {
    el?.querySelector<HTMLElement>('a.btn-solid')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }
}
onMounted(scrollActivePillsIntoView)
watch(
  () => route.name,
  async () => {
    await nextTick()
    scrollActivePillsIntoView()
  },
)

async function signOut() {
  menuOpen.value = false
  await auth.logout()
  router.push({ name: 'login' })
}

const showPw = ref(false)

function openPassword() {
  menuOpen.value = false
  showProfile.value = false
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

// ---- self-service profile (name, email, phone — see updateOwnProfile)
const showProfile = ref(false)
const profileName = ref('')
const profileEmail = ref('')
const profilePhone = ref('')
const profileBusy = ref(false)
const profileError = ref('')
const profileDone = ref(false)

function openProfile() {
  menuOpen.value = false
  showPw.value = false
  showProfile.value = true
  profileError.value = ''
  profileDone.value = false
  profileName.value = auth.user?.name ?? ''
  profileEmail.value = auth.user?.email ?? ''
  profilePhone.value = auth.user?.phone ?? ''
}

function toggleProfile() {
  showProfile.value = !showProfile.value
  profileError.value = ''
  profileDone.value = false
}

async function saveProfile() {
  profileError.value = ''
  profileDone.value = false
  profileBusy.value = true
  try {
    await api('/api/me', {
      method: 'PATCH',
      json: {
        name: profileName.value,
        email: profileEmail.value || null,
        phone: profilePhone.value || null,
      },
    })
    // Refetch rather than patch auth.user locally — keeps it as the single
    // source of truth and picks up the server's own normalization (email
    // lower-cased, blanks turned to null).
    await auth.fetchMe()
    profileDone.value = true
  } catch (e) {
    profileError.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    profileBusy.value = false
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
            @click="openProfile"
          >
            Edit profile
          </button>
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

    <div v-if="auth.user && showProfile" class="no-print mt-4 max-w-md">
      <form class="panel" @submit.prevent="saveProfile">
        <h2 class="display mb-3 text-xl">Edit your profile</h2>
        <p class="mb-3 text-sm text-muted">
          Email and phone are how the app reaches you — a payslip notice by
          email, an SMS if your admin has that turned on. Your role and
          rights are still set by an administrator.
        </p>
        <label class="field-label" for="profile-name">Name</label>
        <input
          id="profile-name"
          v-model="profileName"
          required
          class="field-input mb-3"
        />
        <label class="field-label" for="profile-email">Email</label>
        <input
          id="profile-email"
          v-model="profileEmail"
          type="email"
          autocomplete="email"
          class="field-input mb-3"
        />
        <label class="field-label" for="profile-phone">Phone</label>
        <input
          id="profile-phone"
          v-model="profilePhone"
          type="tel"
          autocomplete="tel"
          class="field-input mono mb-4"
          placeholder="e.g. 0241234567"
        />
        <div class="flex items-center gap-2">
          <button class="btn btn-solid btn-sm" :disabled="profileBusy">
            {{ profileBusy ? 'Saving…' : 'Save profile' }}
          </button>
          <button type="button" class="btn btn-sm" @click="toggleProfile">Close</button>
          <span v-if="profileDone" class="text-sm text-teal">Saved.</span>
        </div>
        <p
          v-if="profileError"
          class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red"
        >
          {{ profileError }}
        </p>
      </form>
    </div>

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

    <nav
      v-if="auth.user"
      ref="primaryNavEl"
      class="no-print -mx-5 my-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&>a]:flex-shrink-0 [&>a]:whitespace-nowrap"
    >
      <!-- Six possible sections, always visible and one tap away \u2014 same
           horizontally-scrolling-on-mobile treatment as the mini-tab strips
           below, rather than gating them behind a "Menu" disclosure. Whichever
           section the current page belongs to gets its own strip of mini tabs
           underneath (outside this row) so a 7-item section like Finance
           doesn't have to fit here too. -->
      <RouterLink :to="{ name: 'entries' }" class="btn" active-class="btn-solid"
        >Time Entry</RouterLink
      >
      <RouterLink :to="{ name: 'tasks' }" class="btn" active-class="btn-solid">Tasks</RouterLink>
      <RouterLink :to="{ name: 'news' }" class="btn" active-class="btn-solid">News</RouterLink>
      <RouterLink
        v-if="auth.rights.view_dashboard"
        :to="{ name: 'dashboard' }"
        class="btn"
        active-class="btn-solid"
        >Dashboard</RouterLink
      >
      <RouterLink
        :to="{ name: reportsHome }"
        class="btn"
        :class="{ 'btn-solid': reportsActive }"
        >Reports</RouterLink
      >
      <RouterLink :to="{ name: 'payments' }" class="btn" :class="{ 'btn-solid': financeActive }"
        >Finance</RouterLink
      >
      <RouterLink
        v-if="auth.isAdmin"
        :to="{ name: 'employees' }"
        class="btn"
        :class="{ 'btn-solid': adminActive }"
        >Admin</RouterLink
      >
    </nav>

    <!-- Section mini-tabs: a single horizontally-scrolling row rather than a
         long stacked list, and always visible (not nested in the collapsible
         Menu above) since these are how you move between the pages you're
         actually working in. -mx-5/px-5 lets the scroll area bleed to the
         screen edge on mobile, matching the page's own gutter. -->
    <div
      v-if="auth.user && reportsActive"
      ref="reportsNavEl"
      class="no-print -mx-5 mb-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [&>a]:flex-shrink-0 [&>a]:whitespace-nowrap"
    >
      <RouterLink
        v-if="auth.rights.view_reports"
        :to="{ name: 'report' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Monthly Report</RouterLink
      >
      <RouterLink :to="{ name: 'trends' }" class="btn btn-sm" active-class="btn-solid"
        >Trends</RouterLink
      >
      <RouterLink :to="{ name: 'absences' }" class="btn btn-sm" active-class="btn-solid"
        >Absences</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_reports"
        :to="{ name: 'card-audit' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Card Audit</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_reports"
        :to="{ name: 'installations-report' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Installations</RouterLink
      >
      <RouterLink
        v-if="auth.isAdmin"
        :to="{ name: 'activity' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Activity</RouterLink
      >
    </div>

    <div
      v-if="auth.user && financeActive"
      ref="financeNavEl"
      class="no-print -mx-5 mb-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [&>a]:flex-shrink-0 [&>a]:whitespace-nowrap"
    >
      <RouterLink :to="{ name: 'payments' }" class="btn btn-sm" active-class="btn-solid"
        >Payments</RouterLink
      >
      <RouterLink
        v-if="auth.rights.view_payslip"
        :to="{ name: 'payslip' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Payslip</RouterLink
      >
      <RouterLink :to="{ name: 'expenses' }" class="btn btn-sm" active-class="btn-solid"
        >Expenses</RouterLink
      >
      <RouterLink
        v-if="auth.rights.use_petty_cash || auth.isAdmin"
        :to="{ name: 'petty-cash' }"
        class="btn btn-sm"
        active-class="btn-solid"
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
        >Approvals</RouterLink
      >
      <RouterLink
        v-if="auth.rights.send_for_approval"
        :to="{ name: 'expense-screening' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Screening</RouterLink
      >
      <RouterLink
        v-if="auth.rights.record_expenses"
        :to="{ name: 'expense-finance' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >To Record</RouterLink
      >
      <RouterLink
        v-if="canSeeExpenseReports"
        :to="{ name: 'expense-reports' }"
        class="btn btn-sm"
        active-class="btn-solid"
        >Expense Reports</RouterLink
      >
    </div>

    <div
      v-if="auth.user && adminActive && auth.isAdmin"
      ref="adminNavEl"
      class="no-print -mx-5 mb-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [&>a]:flex-shrink-0 [&>a]:whitespace-nowrap"
    >
      <RouterLink :to="{ name: 'employees' }" class="btn btn-sm" active-class="btn-solid"
        >Employees</RouterLink
      >
      <RouterLink :to="{ name: 'settings' }" class="btn btn-sm" active-class="btn-solid"
        >Settings</RouterLink
      >
      <RouterLink :to="{ name: 'notifications' }" class="btn btn-sm" active-class="btn-solid"
        >Notifications</RouterLink
      >
    </div>

    <RouterView />
    <TaskDeadlineAlert v-if="auth.user" />
    <NewsPopup v-if="auth.user" />
  </div>
</template>
