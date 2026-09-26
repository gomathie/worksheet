<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { Task } from '../types'
import { OPEN_TASK_STATUSES } from '../../shared/tasks'

const auth = useAuthStore()
const oldTasks = ref<Task[]>([])
const open = ref(false)

// We track whether they've seen it today so they aren't nagged on every page turn.
const seenKey = computed(() => `ledger:task-age-seen:${auth.user?.today ?? ''}`)

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(seenKey.value) === 'true'
  } catch {
    return false
  }
}

function dismiss() {
  open.value = false
  try {
    localStorage.setItem(seenKey.value, 'true')
  } catch {
    //
  }
}

const hasOver3Days = computed(() => 
  oldTasks.value.some(t => {
    const ageMs = Date.now() - new Date(t.updated_at || t.created_at).getTime()
    return ageMs / (1000 * 60 * 60 * 24) > 3
  })
)

const hasOver2Days = computed(() =>
  oldTasks.value.some(t => {
    const ageMs = Date.now() - new Date(t.updated_at || t.created_at).getTime()
    return ageMs / (1000 * 60 * 60 * 24) > 2
  })
)

onMounted(async () => {
  if (!auth.user) return
  if (alreadySeen()) return
  try {
    const tasks = await api<Task[]>('/api/tasks?mine=1')
    const nowMs = Date.now()
    
    oldTasks.value = tasks.filter((t) => {
      if (!(OPEN_TASK_STATUSES as string[]).includes(t.status)) return false
      const ageMs = nowMs - new Date(t.updated_at || t.created_at).getTime()
      const ageDays = ageMs / (1000 * 60 * 60 * 24)
      return ageDays > 2
    })
    
    open.value = oldTasks.value.length > 0
  } catch {
    //
  }
})
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4">
    <div class="panel w-full max-w-md">
      <h2 class="display mb-1 text-xl text-amber">⚠ Pending Task Alert</h2>
      
      <p v-if="hasOver3Days" class="mb-4 text-sm font-medium text-red">
        Your task has been scheduled for deletion or to be reassigned and will affect your finances or payment.
      </p>
      <p v-else-if="hasOver2Days" class="mb-4 text-sm font-medium text-amber">
        You have a task pending for more than 2 days. It will affect your payment when not done.
      </p>

      <ul class="mb-4 space-y-1 text-sm">
        <li v-for="t in oldTasks" :key="t.id" class="flex items-baseline justify-between gap-3">
          <span>{{ t.title }}</span>
          <span class="mono text-xs text-muted whitespace-nowrap">
            Last updated: {{ (t.updated_at || t.created_at).slice(0, 10) }}
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
