<script setup lang="ts">
// A twice-daily popup for tasks assigned to you that are due today or
// tomorrow — a nudge distinct from the in-app notification bell, which is
// easy to leave unread. Purely a client-side reminder (no server-side
// enforcement of the point reduction it warns about); dismissal is tracked
// in localStorage per half-day (AM/PM, by the browser's local clock), so it
// interrupts once each morning and once each afternoon rather than nagging
// on every navigation — or only once, which a full-day key would give.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { Task } from '../types'
import { OPEN_TASK_STATUSES } from '../../shared/tasks'

const auth = useAuthStore()
const due = ref<Task[]>([])
const open = ref(false)

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

// Fixed for the component's lifetime — App.vue mounts this once per session,
// and read (onMounted) / write (dismiss) only need to agree with each other.
const period = new Date().getHours() < 12 ? 'am' : 'pm'
const seenKey = computed(() => `ledger:task-deadline-seen:${auth.user?.today ?? ''}:${period}`)

function alreadySeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey.value) ?? '[]'))
  } catch {
    return new Set()
  }
}

function dismiss() {
  open.value = false
  try {
    const seen = alreadySeen()
    for (const t of due.value) seen.add(t.id)
    localStorage.setItem(seenKey.value, JSON.stringify([...seen]))
  } catch {
    // Private browsing / storage disabled — worst case it reappears next
    // load, which is a nag, not a break.
  }
}

onMounted(async () => {
  if (!auth.user) return
  try {
    const tasks = await api<Task[]>('/api/tasks?mine=1')
    const today = auth.user.today
    const tomorrow = addDays(today, 1)
    const seen = alreadySeen()
    due.value = tasks.filter(
      (t) =>
        (OPEN_TASK_STATUSES as string[]).includes(t.status) &&
        t.due_date !== null &&
        t.due_date >= today &&
        t.due_date <= tomorrow &&
        !seen.has(t.id),
    )
    open.value = due.value.length > 0
  } catch {
    // A failed check should never block the rest of the app from loading.
  }
})
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
    <div class="panel w-full max-w-md">
      <h2 class="display mb-1 text-xl text-amber">⚠ Deadline approaching</h2>
      <p class="mb-3 text-sm text-muted">
        Missing a deadline attracts a reduction in points.
      </p>
      <ul class="mb-4 space-y-1 text-sm">
        <li v-for="t in due" :key="t.id" class="flex items-baseline justify-between gap-3">
          <span>{{ t.title }}</span>
          <span class="mono text-xs text-muted whitespace-nowrap">
            due {{ t.due_date === auth.user?.today ? 'today' : 'tomorrow' }}
          </span>
        </li>
      </ul>
      <div class="flex gap-2">
        <RouterLink :to="{ name: 'tasks' }" class="btn" @click="dismiss">View tasks</RouterLink>
        <button type="button" class="btn btn-solid" @click="dismiss">Got it</button>
      </div>
    </div>
  </div>
</template>
