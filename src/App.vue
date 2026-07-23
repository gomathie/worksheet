<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function signOut() {
  await auth.logout()
  router.push({ name: 'login' })
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
          <h1 class="display text-3xl leading-none">Ledger</h1>
          <p class="mt-0.5 text-xs tracking-[0.12em] text-muted uppercase">
            Timesheet &amp; QAP Tracker
          </p>
        </div>
      </div>
      <div v-if="auth.user" class="flex items-center gap-3 text-sm">
        <span class="text-muted">{{ auth.user.name }}</span>
        <span
          class="display rounded-full border border-line px-2 py-0.5 text-xs tracking-wider"
          >{{ auth.user.role }}</span
        >
        <button class="btn btn-sm" @click="signOut">Sign out</button>
      </div>
    </header>

    <nav v-if="auth.user" class="no-print my-5 flex flex-wrap gap-1.5">
      <RouterLink :to="{ name: 'entries' }" class="btn" active-class="btn-solid"
        >Time Entry</RouterLink
      >
      <template v-if="auth.isAdmin">
        <RouterLink :to="{ name: 'dashboard' }" class="btn" active-class="btn-solid"
          >Dashboard</RouterLink
        >
        <RouterLink :to="{ name: 'report' }" class="btn" active-class="btn-solid"
          >Monthly Report</RouterLink
        >
        <RouterLink :to="{ name: 'employees' }" class="btn" active-class="btn-solid"
          >Employees</RouterLink
        >
        <RouterLink :to="{ name: 'settings' }" class="btn" active-class="btn-solid"
          >Settings</RouterLink
        >
      </template>
    </nav>

    <RouterView />
  </div>
</template>
