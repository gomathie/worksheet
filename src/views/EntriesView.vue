<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { computeHours } from '../../shared/logic'
import { useAuthStore } from '../stores/auth'
import type { Employee, Entry } from '../types'

const auth = useAuthStore()

const employees = ref<Employee[]>([])
const entries = ref<Entry[]>([])
const month = ref('')
const filterEmployee = ref('')
const error = ref('')
const busy = ref(false)
const editingId = ref<string | null>(null)

const form = ref({
  employee_id: '',
  work_date: '',
  time_start: '09:00',
  time_end: '17:00',
  classifications: 0,
  qap: 0,
  notes: '',
})

const hoursPreview = computed(() => {
  try {
    return computeHours(form.value.time_start, form.value.time_end).toFixed(2)
  } catch {
    return '—'
  }
})

const activeEmployees = computed(() => employees.value.filter((e) => e.active))

async function loadEntries() {
  const params = new URLSearchParams({ month: month.value })
  if (auth.isAdmin && filterEmployee.value) {
    params.set('employee_id', filterEmployee.value)
  }
  entries.value = await api<Entry[]>(`/api/entries?${params}`)
}

onMounted(async () => {
  const today = auth.user!.today
  month.value = today.slice(0, 7)
  form.value.work_date = today
  form.value.employee_id = auth.user!.id
  employees.value = await api<Employee[]>('/api/employees')
  await loadEntries()
})

watch([month, filterEmployee], loadEntries)

function resetForm() {
  editingId.value = null
  form.value = {
    employee_id: auth.user!.id,
    work_date: auth.user!.today,
    time_start: '09:00',
    time_end: '17:00',
    classifications: 0,
    qap: 0,
    notes: '',
  }
}

function startEdit(entry: Entry) {
  editingId.value = entry.id
  form.value = {
    employee_id: entry.employee_id,
    work_date: entry.work_date,
    time_start: entry.time_start,
    time_end: entry.time_end,
    classifications: entry.classifications,
    qap: entry.qap,
    notes: entry.notes ?? '',
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const payload = { ...form.value, notes: form.value.notes || null }
    if (editingId.value) {
      await api(`/api/entries/${editingId.value}`, { method: 'PATCH', json: payload })
    } else {
      await api('/api/entries', { method: 'POST', json: payload })
    }
    resetForm()
    await loadEntries()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save entry'
  } finally {
    busy.value = false
  }
}

async function remove(entry: Entry) {
  if (!confirm(`Delete the ${entry.work_date} entry?`)) return
  await api(`/api/entries/${entry.id}`, { method: 'DELETE' })
  if (editingId.value === entry.id) resetForm()
  await loadEntries()
}
</script>

<template>
  <div>
    <div v-if="auth.rights.edit_entries" class="panel mb-6">
      <h2 class="display mb-4 text-2xl">
        {{ editingId ? 'Edit entry' : 'Log time' }}
      </h2>
      <form class="grid grid-cols-2 gap-4 md:grid-cols-4" @submit.prevent="submit">
        <div class="col-span-2">
          <label class="field-label" for="emp">Employee</label>
          <select
            id="emp"
            v-model="form.employee_id"
            class="field-input"
            :disabled="!auth.isAdmin"
          >
            <option v-for="e in activeEmployees" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </div>
        <div class="col-span-2 md:col-span-2">
          <label class="field-label" for="date">Date</label>
          <input
            id="date"
            v-model="form.work_date"
            type="date"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="start">Time start</label>
          <input
            id="start"
            v-model="form.time_start"
            type="time"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="end">Time end</label>
          <input
            id="end"
            v-model="form.time_end"
            type="time"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="hours">Hours</label>
          <input
            id="hours"
            :value="hoursPreview"
            readonly
            class="field-input mono bg-teal-soft"
            tabindex="-1"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="field-label" for="cls">Classif.</label>
            <input
              id="cls"
              v-model.number="form.classifications"
              type="number"
              min="0"
              step="1"
              required
              class="field-input mono"
            />
          </div>
          <div>
            <label class="field-label" for="qap">QAP</label>
            <input
              id="qap"
              v-model.number="form.qap"
              type="number"
              min="0"
              step="1"
              required
              class="field-input mono"
            />
          </div>
        </div>
        <div class="col-span-2 md:col-span-4">
          <label class="field-label" for="notes">Notes (optional)</label>
          <input
            id="notes"
            v-model="form.notes"
            class="field-input"
            placeholder="Anything worth remembering about this shift"
          />
        </div>
        <div class="col-span-2 flex gap-2 md:col-span-4">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : editingId ? 'Save changes' : 'Add entry' }}
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
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="display text-2xl">Recent entries</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="month"
            type="month"
            class="field-input mono !w-auto"
            aria-label="Filter month"
          />
          <select
            v-if="auth.isAdmin"
            v-model="filterEmployee"
            class="field-input !w-auto"
            aria-label="Filter employee"
          >
            <option value="">All employees</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">
              {{ e.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Date</th>
              <th v-if="auth.isAdmin">Employee</th>
              <th class="num">Start</th>
              <th class="num">End</th>
              <th class="num">Hours</th>
              <th class="num">Classif.</th>
              <th class="num">QAP</th>
              <th>Notes</th>
              <th v-if="auth.rights.edit_entries"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="mono whitespace-nowrap">{{ e.work_date }}</td>
              <td v-if="auth.isAdmin">{{ e.employee_name }}</td>
              <td class="num">{{ e.time_start }}</td>
              <td class="num">{{ e.time_end }}</td>
              <td class="num">{{ e.hours.toFixed(2) }}</td>
              <td class="num">{{ e.classifications }}</td>
              <td class="num">{{ e.qap }}</td>
              <td class="max-w-56 truncate text-muted" :title="e.notes ?? ''">
                {{ e.notes }}
              </td>
              <td v-if="auth.rights.edit_entries" class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" @click="startEdit(e)">Edit</button>
                <button class="btn btn-sm btn-danger" @click="remove(e)">Del</button>
              </td>
            </tr>
            <tr v-if="entries.length === 0">
              <td :colspan="auth.isAdmin ? 9 : 8" class="py-6 text-center text-muted">
                No entries for this month yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
