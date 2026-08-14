<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isOverdue,
  type TaskStatus,
} from '../../shared/tasks'
import type { Task, TaskAssignee } from '../types'

// A single task, Jira-issue-style: the code, its state, and everything
// about it in one place — deliberately simple, no comment thread or activity
// feed, since a task here is a note about intent, not a record to audit.

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const task = ref<Task | null>(null)
const employees = ref<TaskAssignee[]>([])
const error = ref('')
const busy = ref(false)

const id = computed(() => route.params.id as string)

// Assigning work to someone else is what the right is for; matches the same
// gate TasksView uses for its own assignee picker. Claiming an open
// "Everyone" task is separate — see the Accept button below — and needs no
// right at all, since nobody is being volun-told.
const canManage = computed(() => auth.isAdmin || auth.rights.manage_tasks)
const can = (a: 'edit' | 'delete' | 'set_status' | 'accept') =>
  task.value?.actions.includes(a) ?? false

async function load() {
  error.value = ''
  try {
    task.value = await api<Task>(`/api/tasks/${id.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load task'
  }
}
onMounted(async () => {
  await load()
  if (canManage.value) {
    // See TasksView: /api/employees hides everyone else from a non-admin.
    employees.value = await api<TaskAssignee[]>('/api/tasks/assignees')
  }
})

const statusTone: Record<TaskStatus, string> = {
  todo: 'border-line text-muted',
  in_progress: 'border-amber text-amber',
  done: 'border-teal bg-teal-soft text-teal',
  cancelled: 'border-line text-muted',
}

async function reassign(assigneeId: string) {
  if (!task.value) return
  error.value = ''
  busy.value = true
  try {
    task.value = await api<Task>(`/api/tasks/${id.value}`, {
      method: 'PATCH',
      json: { assignee_id: assigneeId || null },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to reassign the task'
  } finally {
    busy.value = false
  }
}

async function accept() {
  if (!task.value) return
  error.value = ''
  busy.value = true
  try {
    task.value = await api<Task>(`/api/tasks/${id.value}`, {
      method: 'PATCH',
      json: { accept: true },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to accept the task'
  } finally {
    busy.value = false
  }
}

async function setStatus(status: TaskStatus) {
  if (!task.value) return
  error.value = ''
  busy.value = true
  try {
    task.value = await api<Task>(`/api/tasks/${id.value}`, { method: 'PATCH', json: { status } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update the task'
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!task.value) return
  if (!confirm(`Delete "${task.value.title}"? This cannot be undone.`)) return
  error.value = ''
  busy.value = true
  try {
    await api(`/api/tasks/${id.value}`, { method: 'DELETE' })
    router.push({ name: 'tasks' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete the task'
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <RouterLink :to="{ name: 'tasks' }" class="text-sm text-muted underline"
        >&larr; Back to tasks</RouterLink
      >
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div v-if="task" class="panel">
      <div class="mb-1 flex flex-wrap items-center gap-2">
        <span class="mono text-sm text-muted">{{ task.task_code }}</span>
        <span
          class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
          :class="statusTone[task.status]"
          >{{ TASK_STATUS_LABELS[task.status] }}</span
        >
        <span
          v-if="task.priority === 'high'"
          class="display rounded-full border border-red px-2 py-0.5 text-xs tracking-wider text-red"
          >High</span
        >
        <span
          v-if="isOverdue(task, auth.user!.today)"
          class="display rounded-full border border-red bg-red-soft px-2 py-0.5 text-xs tracking-wider text-red"
          >Overdue</span
        >
        <span
          v-if="task.broadcast"
          class="display rounded-full border border-teal px-2 py-0.5 text-xs tracking-wider text-teal"
          >{{ task.assignee_id ? 'From the open pool' : 'Open to everyone' }}</span
        >
      </div>
      <h2
        class="display mb-4 text-2xl"
        :class="{ 'line-through text-muted': task.status === 'done' || task.status === 'cancelled' }"
      >
        {{ task.title }}
      </h2>

      <p v-if="task.details" class="mb-4 text-sm whitespace-pre-wrap">{{ task.details }}</p>
      <p v-else class="mb-4 text-sm text-muted italic">No further details.</p>

      <div class="mb-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
        <div>
          <p class="field-label">Assigned to</p>
          <select
            v-if="canManage"
            :value="task.assignee_id ?? ''"
            class="field-input !w-auto"
            :disabled="busy"
            aria-label="Reassign task"
            @change="reassign(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Nobody yet</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
          <p v-else-if="task.assignee_name">{{ task.assignee_name }}</p>
          <p v-else-if="task.broadcast" class="text-teal">Nobody yet — first to accept it</p>
          <p v-else>Unassigned</p>
        </div>
        <div>
          <p class="field-label">Raised by</p>
          <p>{{ task.created_by_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Wanted by</p>
          <p class="mono">{{ task.due_date ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Created</p>
          <p class="mono text-xs">{{ task.created_at }}</p>
        </div>
        <div v-if="task.updated_at">
          <p class="field-label">Last updated</p>
          <p class="mono text-xs">{{ task.updated_at }}</p>
        </div>
        <div v-if="task.completed_at">
          <p class="field-label">Completed</p>
          <p class="mono text-xs">{{ task.completed_at }}</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          v-if="can('accept')"
          class="btn btn-sm btn-solid"
          :disabled="busy"
          @click="accept"
        >
          {{ busy ? 'Accepting…' : 'Accept this task' }}
        </button>
        <select
          v-if="can('set_status')"
          :value="task.status"
          class="field-input !w-36"
          :disabled="busy"
          aria-label="Change status"
          @change="setStatus(($event.target as HTMLSelectElement).value as TaskStatus)"
        >
          <option v-for="s in TASK_STATUSES" :key="s" :value="s">
            {{ TASK_STATUS_LABELS[s] }}
          </option>
        </select>
        <RouterLink
          v-if="can('edit')"
          :to="{ name: 'tasks', query: { edit: task.id } }"
          class="btn btn-sm"
          >Edit</RouterLink
        >
        <button
          v-if="can('delete')"
          class="btn btn-sm btn-danger"
          :disabled="busy"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
