<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from './api'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function signOut() {
  await auth.logout()
  router.push({ name: 'login' })
}

const showPw = ref(false)
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
      <div v-if="auth.user" class="flex items-center gap-3 text-sm">
        <span class="text-muted">{{ auth.user.name }}</span>
        <span
          class="display rounded-full border border-line px-2 py-0.5 text-xs tracking-wider"
          >{{ auth.user.role }}</span
        >
        <button class="btn btn-sm" @click="togglePw">Password</button>
        <button class="btn btn-sm" @click="signOut">Sign out</button>
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

    <nav v-if="auth.user" class="no-print my-5 flex flex-wrap gap-1.5">
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
      <RouterLink :to="{ name: 'payslip' }" class="btn" active-class="btn-solid"
        >Payslip</RouterLink
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
    </nav>

    <RouterView />
  </div>
</template>
