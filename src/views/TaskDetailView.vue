<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import PointDeductionModal from '../components/PointDeductionModal.vue'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isOverdue,
  type TaskStatus,
} from '../../shared/tasks'
import type { Task, TaskAssignee, TaskComment } from '../types'

// A single task, Jira-issue-style: the code, its state, everything about
// it, and a comment thread underneath for activity/progress updates.

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const task = ref<Task | null>(null)
const employees = ref<TaskAssignee[]>([])
const comments = ref<TaskComment[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const commentBusy = ref(false)
const newComment = ref('')

const id = computed(() => route.params.id as string)

// Assigning work to someone else is what the right is for; matches the same
// gate TasksView uses for its own assignee picker. Claiming an open
// "Everyone" task is separate — see the Accept button below — and needs no
// right at all, since nobody is being volun-told.
const canManage = computed(() => auth.isAdmin || auth.rights.manage_tasks)
const can = (a: 'edit' | 'delete' | 'set_status' | 'accept') =>
  task.value?.actions.includes(a) ?? false

// Logging a violation deducts points, so it needs manage_point_deductions
// (same right the Employees tab's Deduct button requires), not manage_tasks
// — organizing work and penalizing someone for it are different powers. Self
// is excluded because the deduction API itself refuses it.
const canLogViolation = computed(
  () =>
    (auth.isAdmin || auth.rights.manage_point_deductions) &&
    Boolean(task.value?.assignee_id) &&
    task.value?.assignee_id !== auth.user?.id,
)
const violationModalOpen = ref(false)
const violationDefaultAmount = ref<number | undefined>(undefined)

async function openViolationModal() {
  if (!task.value?.assignee_id) return
  try {
    const bal = await api<{ task_violation_points: number }>(
      `/api/point-deductions/balance/${task.value.assignee_id}`,
    )
    violationDefaultAmount.value = bal.task_violation_points
  } catch {
    violationDefaultAmount.value = undefined
  }
  violationModalOpen.value = true
}

function onViolationSaved() {
  notice.value = 'Violation logged and points deducted.'
}

async function load() {
  error.value = ''
  try {
    const [t, c] = await Promise.all([
      api<Task>(`/api/tasks/${id.value}`),
      api<TaskComment[]>(`/api/tasks/${id.value}/comments`),
    ])
    task.value = t
    comments.value = c
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

async function ping() {
  if (!task.value) return
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    const res = await api<{ task: Task; elapsed: string; comment: TaskComment }>(
      `/api/tasks/${id.value}/ping`,
      { method: 'POST' },
    )
    task.value = res.task
    comments.value.push(res.comment)
    notice.value = `Marked as actively worked on — ${res.elapsed}.`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to mark task as active'
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

interface ChecklistItem {
  title: string
  completed: boolean
}

const parsedChecklist = computed<ChecklistItem[]>(() => {
  if (!task.value || !task.value.checklist) return []
  try {
    return JSON.parse(task.value.checklist)
  } catch {
    return []
  }
})

async function toggleChecklistItem(index: number, completed: boolean) {
  if (!task.value) return
  
  const newList = [...parsedChecklist.value]
  newList[index].completed = completed
  
  error.value = ''
  busy.value = true
  try {
    task.value = await api<Task>(`/api/tasks/${id.value}`, { 
      method: 'PATCH', 
      json: { checklist: JSON.stringify(newList) } 
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update checklist'
  } finally {
    busy.value = false
  }
}

async function postComment() {
  if (!newComment.value.trim() || !task.value) return
  error.value = ''
  commentBusy.value = true
  try {
    const created = await api<TaskComment>(`/api/tasks/${id.value}/comments`, {
      method: 'POST',
      json: { content: newComment.value }
    })
    comments.value.push(created)
    newComment.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to post comment'
  } finally {
    commentBusy.value = false
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
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

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

      <div v-if="parsedChecklist.length > 0" class="mb-6 rounded-md border border-line bg-surface p-4">
        <h3 class="field-label mb-2">Checklist</h3>
        <ul class="space-y-2">
          <li v-for="(item, idx) in parsedChecklist" :key="idx" class="flex items-start gap-2">
            <input 
              type="checkbox" 
              :checked="item.completed" 
              :disabled="!can('set_status') || busy"
              class="mt-1"
              @change="toggleChecklistItem(idx, ($event.target as HTMLInputElement).checked)"
            />
            <span class="text-sm" :class="{ 'line-through text-muted': item.completed }">{{ item.title }}</span>
          </li>
        </ul>
      </div>

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
        <div v-if="task.secondary_person_name">
          <p class="field-label">{{ task.secondary_role === 'assignee' ? 'Also assigned to' : 'Observer' }}</p>
          <p>{{ task.secondary_person_name }}</p>
        </div>
        <div>
          <p class="field-label">Raised by</p>
          <p>{{ task.created_by_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Wanted by</p>
          <p class="mono">{{ task.due_date ?? '—' }}</p>
        </div>
        <div v-if="task.recurrence && task.recurrence !== 'none'">
          <p class="field-label">Recurrence</p>
          <p class="capitalize">{{ task.recurrence }}</p>
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
          v-if="task.status === 'in_progress' && can('set_status')"
          class="btn btn-sm btn-solid"
          title="Mark as still working on it to prevent overdue warnings"
          :disabled="busy"
          @click="ping"
        >
          Working on it
        </button>
        <button
          v-if="(task.status === 'done' || task.status === 'cancelled') && can('set_status')"
          class="btn btn-sm"
          title="Move this task back to To do"
          :disabled="busy"
          @click="setStatus('todo')"
        >
          Reopen
        </button>
        <button
          v-if="canLogViolation"
          class="btn btn-sm btn-danger"
          title="Record a violation and deduct points from the assignee"
          :disabled="busy"
          @click="openViolationModal"
        >
          Log violation
        </button>
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

    <PointDeductionModal
      v-if="task"
      :employee="{ id: task.assignee_id!, name: task.assignee_name ?? 'Unknown' }"
      :open="violationModalOpen"
      :task-id="task.id"
      :default-amount="violationDefaultAmount"
      :context-label="`${task.task_code ?? ''}: ${task.title}`"
      @close="violationModalOpen = false"
      @saved="onViolationSaved"
    />

    <!-- Comments Section -->
    <div v-if="task" class="panel mt-6">
      <h3 class="mb-4 text-lg font-medium">Activity & Comments</h3>
      
      <div v-if="comments.length > 0" class="mb-6 space-y-4">
        <div v-for="c in comments" :key="c.id" class="rounded-lg border border-line bg-cream p-3">
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="font-medium">{{ c.employee_name }}</span>
            <span class="mono text-muted">{{ c.created_at.slice(0, 16).replace('T', ' ') }}</span>
          </div>
          <p class="text-sm whitespace-pre-wrap">{{ c.content }}</p>
        </div>
      </div>
      <p v-else class="mb-6 text-sm text-muted italic">No comments yet. Be the first to comment.</p>

      <form @submit.prevent="postComment" class="flex flex-col gap-2">
        <textarea
          v-model="newComment"
          class="field-input min-h-[80px]"
          placeholder="Add a comment or progress update..."
          :disabled="commentBusy"
          required
        ></textarea>
        <div class="flex justify-end">
          <button type="submit" class="btn btn-sm btn-solid" :disabled="commentBusy || !newComment.trim()">
            {{ commentBusy ? 'Posting…' : 'Post Comment' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
