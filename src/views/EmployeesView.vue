<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { Employee } from '../types'

const employees = ref<Employee[]>([])
const error = ref('')
const busy = ref(false)
const editingId = ref<string | null>(null)

const form = ref({ name: '', email: '', role: 'employee' })

async function load() {
  employees.value = await api<Employee[]>('/api/employees')
}
onMounted(load)

function startEdit(e: Employee) {
  editingId.value = e.id
  form.value = { name: e.name, email: e.email ?? '', role: e.role }
}

function resetForm() {
  editingId.value = null
  form.value = { name: '', email: '', role: 'employee' }
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const payload = {
      name: form.value.name,
      email: form.value.email || null,
      role: form.value.role,
    }
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
</script>

<template>
  <div>
    <div class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit employee' : 'Add employee' }}
      </h2>
      <form class="grid grid-cols-1 gap-4 md:grid-cols-4" @submit.prevent="submit">
        <div>
          <label class="field-label" for="name">Name</label>
          <input id="name" v-model="form.name" required class="field-input" />
        </div>
        <div>
          <label class="field-label" for="email">Email (for login)</label>
          <input id="email" v-model="form.email" type="email" class="field-input" />
        </div>
        <div>
          <label class="field-label" for="role">Role</label>
          <select id="role" v-model="form.role" class="field-input">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="flex items-end gap-2">
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
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employees" :key="e.id" :class="{ 'opacity-50': !e.active }">
              <td>{{ e.name }}</td>
              <td class="mono text-[13px]">{{ e.email }}</td>
              <td>
                <span
                  class="display rounded-full border px-2 py-0.5 text-xs tracking-wider"
                  :class="e.role === 'admin' ? 'border-teal text-teal' : 'border-line text-muted'"
                  >{{ e.role }}</span
                >
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
