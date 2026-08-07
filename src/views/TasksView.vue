<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isOpen,
  isOverdue,
  type TaskPriority,
  type TaskStatus,
} from '../../shared/tasks'
import type { Employee, Task } from '../types'

// A standalone to-do list. Deliberately unconnected to entries, cards or pay:
// a task records intent, and nothing here feeds a points or money figure.

const auth = useAuthStore()

const tasks = ref<Task[]>([])
const employees = ref<Employee[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const showDone = ref(false)

// Assigning work to someone else is what the right is for; without it a
// person can still keep their own list.
const canManage = computed(() => auth.isAdmin || auth.rights.manage_tasks)

const blank = () => ({
  title: '',
  details: '',
  assignee_id: auth.user!.id,
  priority: 'normal' as TaskPriority,
  due_date: '',
})
const form = ref(blank())
const editingId = ref<string | null>(null)

async function load() {
  error.value = ''
  try {
    tasks.value = await api<Task[]>('/api/tasks')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load tasks'
  }
}

onMounted(async () => {
  await load()
  if (canManage.value) {
    employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
  }
})

const open = computed(() => tasks.value.filter((t) => isOpen(t.status)))
const closed = computed(() => tasks.value.filter((t) => !isOpen(t.status)))
const visible = computed(() => (showDone.value ? tasks.value : open.value))
const mineOpen = computed(
  () => open.value.filter((t) => t.assignee_id === auth.user!.id).length,
)
const overdue = computed(
  () => open.value.filter((t) => isOverdue(t, auth.user!.today)).length,
)

function startEdit(t: Task) {
  editingId.value = t.id
  form.value = {
    title: t.title,
    details: t.details ?? '',
    assignee_id: t.assignee_id ?? '',
    priority: t.priority,
    due_date: t.due_date ?? '',
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  editingId.value = null
  form.value = blank()
}

async function save() {
  error.value = ''
  notice.value = ''
  if (!form.value.title.trim()) {
    error.value = 'Give the task a title.'
    return
  }
  busy.value = 'form'
  try {
    const payload = {
      title: form.value.title.trim(),
      details: form.value.details.trim() || null,
      assignee_id: form.value.assignee_id || null,
      priority: form.value.priority,
      due_date: form.value.due_date || null,
    }
    if (editingId.value) {
      await api(`/api/tasks/${editingId.value}`, { method: 'PATCH', json: payload })
      notice.value = 'Task updated.'
    } else {
      await api('/api/tasks', { method: 'POST', json: payload })
      notice.value = 'Task added.'
    }
    resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save the task'
  } finally {
    busy.value = ''
  }
}

async function setStatus(t: Task, status: TaskStatus) {
  error.value = ''
  busy.value = t.id
  try {
    await api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { status } })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update the task'
  } finally {
    busy.value = ''
  }
}

async function remove(t: Task) {
  if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return
  error.value = ''
  busy.value = t.id
  try {
    await api(`/api/tasks/${t.id}`, { method: 'DELETE' })
    if (editingId.value === t.id) resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete the task'
  } finally {
    busy.value = ''
  }
}

const can = (t: Task, action: 'edit' | 'delete' | 'set_status') =>
  t.actions.includes(action)

const statusTone: Record<TaskStatus, string> = {
  todo: 'border-line text-muted',
  in_progress: 'border-amber text-amber',
  done: 'border-teal bg-teal-soft text-teal',
  cancelled: 'border-line text-muted',
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Tasks</h2>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="showDone" type="checkbox" />
        Show finished
      </label>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
      <div class="panel">
        <p class="field-label">Open</p>
        <p class="stat-figure">{{ open.length }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Assigned to you</p>
        <p class="stat-figure">{{ mineOpen }}</p>
      </div>
      <div class="panel col-span-2 md:col-span-1">
        <p class="field-label">Overdue</p>
        <p class="stat-figure" :class="overdue ? 'text-red' : 'text-teal'">
          {{ overdue }}
        </p>
      </div>
    </div>

    <!-- ============================================================ form -->
    <form class="panel mb-6" @submit.prevent="save">
      <h3 class="display mb-3 text-xl">
        {{ editingId ? 'Edit task' : 'New task' }}
      </h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div class="md:col-span-2">
          <label class="field-label" for="t-title">Title</label>
          <input
            id="t-title"
            v-model="form.title"
            required
            maxlength="200"
            class="field-input"
            placeholder="What needs doing"
          />
        </div>
        <div>
          <label class="field-label" for="t-assignee">Assigned to</label>
          <select
            v-if="canManage"
            id="t-assignee"
            v-model="form.assignee_id"
            class="field-input"
          >
            <option value="">Nobody yet</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
          <!-- Without the right there is nobody else to pick, so say so
               rather than offering a select with one option. -->
          <input v-else id="t-assignee" :value="auth.user!.name" readonly class="field-input" />
        </div>
        <div>
          <label class="field-label" for="t-due">Wanted by (optional)</label>
          <input id="t-due" v-model="form.due_date" type="date" class="field-input mono" />
        </div>
        <div class="md:col-span-3">
          <label class="field-label" for="t-details">Details (optional)</label>
          <input
            id="t-details"
            v-model="form.details"
            maxlength="2000"
            class="field-input"
            placeholder="Anything the person needs to know"
          />
        </div>
        <div>
          <label class="field-label" for="t-priority">Priority</label>
          <select id="t-priority" v-model="form.priority" class="field-input">
            <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">
              {{ TASK_PRIORITY_LABELS[p] }}
            </option>
          </select>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-solid" :disabled="busy === 'form'">
          {{ busy === 'form' ? 'Saving…' : editingId ? 'Save changes' : 'Add task' }}
        </button>
        <button v-if="editingId" type="button" class="btn" @click="resetForm">
          Cancel
        </button>
      </div>
    </form>

    <!-- =========================================================== list -->
    <p v-if="visible.length === 0" class="panel text-muted">
      {{ showDone ? 'No tasks yet.' : 'Nothing open. Add one above.' }}
    </p>

    <div v-for="t in visible" :key="t.id" class="panel mb-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-lg font-medium" :class="{ 'line-through text-muted': t.status === 'done' || t.status === 'cancelled' }">
              {{ t.title }}
            </h3>
            <span
              class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
              :class="statusTone[t.status]"
              >{{ TASK_STATUS_LABELS[t.status] }}</span
            >
            <span
              v-if="t.priority === 'high'"
              class="display rounded-full border border-red px-2 py-0.5 text-xs tracking-wider text-red"
              >High</span
            >
            <span
              v-if="isOverdue(t, auth.user!.today)"
              class="display rounded-full border border-red bg-red-soft px-2 py-0.5 text-xs tracking-wider text-red"
              >Overdue</span
            >
          </div>
          <p v-if="t.details" class="mt-1 text-sm">{{ t.details }}</p>
          <p class="mt-1 text-xs text-muted">
            {{ t.assignee_name ?? 'Unassigned' }}
            <template v-if="t.due_date">
              · wanted by <span class="mono">{{ t.due_date }}</span>
            </template>
            <template v-if="t.created_by_name">· raised by {{ t.created_by_name }}</template>
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <select
            v-if="can(t, 'set_status')"
            :value="t.status"
            class="field-input !w-36"
            :disabled="busy === t.id"
            :aria-label="`Status for ${t.title}`"
            @change="setStatus(t, ($event.target as HTMLSelectElement).value as TaskStatus)"
          >
            <option v-for="s in TASK_STATUSES" :key="s" :value="s">
              {{ TASK_STATUS_LABELS[s] }}
            </option>
          </select>
          <button
            v-if="can(t, 'edit')"
            class="btn btn-sm"
            :disabled="busy === t.id"
            @click="startEdit(t)"
          >
            Edit
          </button>
          <button
            v-if="can(t, 'delete')"
            class="btn btn-sm btn-danger"
            :disabled="busy === t.id"
            @click="remove(t)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <p v-if="!showDone && closed.length" class="mt-4 text-sm text-muted">
      {{ closed.length }} finished or cancelled task{{ closed.length === 1 ? '' : 's' }}
      hidden.
    </p>
  </div>
</template>
