<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { Task } from '../types'

// Resolves /t/TASK-007 to the task's own page. The server applies the normal
// task visibility rules to the lookup.
const route = useRoute()
const router = useRouter()
const error = ref('')

onMounted(async () => {
  try {
    const task = await api<Task>(`/api/tasks/${encodeURIComponent(String(route.params.code))}`)
    router.replace({ name: 'task-detail', params: { id: task.id } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Task not found'
  }
})
</script>

<template>
  <div class="panel">
    <p v-if="!error" class="text-muted">Opening task…</p>
    <template v-else>
      <p class="mb-3 text-red">{{ error }}</p>
      <RouterLink :to="{ name: 'tasks' }" class="btn btn-sm">Go to tasks</RouterLink>
    </template>
  </div>
</template>
