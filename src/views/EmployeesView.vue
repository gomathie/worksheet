<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { Employee } from '../types'

const employees = ref<Employee[]>([])
const error = ref('')
const busy = ref(false)
const editingId = ref<string | null>(null)

const blankRights = () => ({
  edit_entries: true,
  view_dashboard: false,
  view_reports: false,
})

const form = ref({
  name: '',
  email: '',
  username: '',
  password: '',
  role: 'employee',
  rights: blankRights(),
})

async function load() {
  employees.value = await api<Employee[]>('/api/employees')
}
onMounted(load)

function startEdit(e: Employee) {
  editingId.value = e.id
  form.value = {
    name: e.name,
    email: e.email ?? '',
    username: e.username ?? '',
    password: '',
    role: e.role,
    rights: { ...e.rights },
  }
}

function resetForm() {
  editingId.value = null
  form.value = {
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'employee',
    rights: blankRights(),
  }
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.value.name,
      email: form.value.email || null,
      username: form.value.username || null,
      role: form.value.role,
      rights: form.value.rights,
    }
    if (form.value.password) payload.password = form.value.password
    if (editingId.value) {
      await api(`/api/employees/${editingId.value}`, { method: 'PATCH', json: payload })
    } else {
      await api('/api/employees', { method: 'POST', json: payload })
    }
    resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    busy.value = false
  }
}

async function toggleActive(e: Employee) {
  error.value = ''
  try {
    if (e.active) {
      if (!confirm(`Deactivate ${e.name}? Their entries are kept.`)) return
      await api(`/api/employees/${e.id}`, { method: 'DELETE' })
    } else {
      await api(`/api/employees/${e.id}`, { method: 'PATCH', json: { active: 1 } })
    }
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update'
  }
}

function rightsSummary(e: Employee): string {
  if (e.role === 'admin') return 'All rights'
  const labels: [keyof Employee['rights'], string][] = [
    ['edit_entries', 'Log time'],
    ['view_dashboard', 'Dashboard'],
    ['view_reports', 'Reports'],
  ]
  const granted = labels.filter(([key]) => e.rights[key]).map(([, label]) => label)
  return granted.length ? granted.join(', ') : 'View own entries only'
}
</script>

<template>
  <div>
    <div class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit employee' : 'Add employee' }}
      </h2>
      <form @submit.prevent="submit">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label class="field-label" for="name">Name</label>
            <input id="name" v-model="form.name" required class="field-input" />
          </div>
          <div>
            <label class="field-label" for="email">Email (optional)</label>
            <input id="email" v-model="form.email" type="email" class="field-input" />
          </div>
          <div>
            <label class="field-label" for="role">Role</label>
            <select id="role" v-model="form.role" class="field-input">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="username">Username (for login)</label>
            <input
              id="username"
              v-model="form.username"
              autocapitalize="none"
              spellcheck="false"
              class="field-input"
              placeholder="e.g. ama.k"
            />
          </div>
          <div>
            <label class="field-label" for="password">
              {{ editingId ? 'New password (blank = keep current)' : 'Password' }}
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              minlength="8"
              class="field-input"
              placeholder="min. 8 characters"
            />
          </div>
        </div>

        <fieldset class="mt-4" :disabled="form.role === 'admin'">
          <legend class="field-label">Rights</legend>
          <p v-if="form.role === 'admin'" class="mb-2 text-xs text-muted">
            Admins hold every right, plus employee and settings management.
          </p>
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="form.rights.edit_entries" type="checkbox" />
              Log &amp; edit own time entries
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_dashboard" type="checkbox" />
              View team dashboard
            </label>
            <label class="flex items-center gap-2">
              <input v-model="form.rights.view_reports" type="checkbox" />
              View monthly reports
            </label>
          </div>
        </fieldset>

        <div class="mt-5 flex gap-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : editingId ? 'Save' : 'Add' }}
          </button>
          <button v-if="editingId" type="button" class="btn" @click="resetForm">
            Cancel
          </button>
        </div>
      </form>
      <p v-if="error" class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>

    <div class="panel">
      <h2 class="display mb-4 text-2xl">Team</h2>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Rights</th>
              <th>Login</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employees" :key="e.id" :class="{ 'opacity-50': !e.active }">
              <td>
                {{ e.name }}
                <div v-if="e.email" class="mono text-xs text-muted">{{ e.email }}</div>
              </td>
              <td class="mono text-[13px]">{{ e.username ?? '—' }}</td>
              <td>
                <span
                  class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
                  :class="e.role === 'admin' ? 'border-teal text-teal' : 'border-line text-muted'"
                  >{{ e.role }}</span
                >
              </td>
              <td class="text-xs">{{ rightsSummary(e) }}</td>
              <td class="text-xs">
                {{ e.username && e.has_password ? 'Enabled' : 'No credentials' }}
              </td>
              <td>{{ e.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" @click="startEdit(e)">Edit</button>
                <button
                  class="btn btn-sm"
                  :class="e.active ? 'btn-danger' : ''"
                  @click="toggleActive(e)"
                >
                  {{ e.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
