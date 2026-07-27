<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import type { Absence, Employee } from '../types'

const auth = useAuthStore()
const currentYear = new Date(auth.user!.today).getUTCFullYear()

const year = ref(currentYear)
const absences = ref<Absence[]>([])
const employees = ref<Employee[]>([])
const selectedId = ref(auth.user!.id)
const error = ref('')
const busy = ref(false)

const TYPES = [
  { value: 'leave', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other', label: 'Other' },
]
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t

const form = ref({
  work_date: auth.user!.today,
  type: 'leave',
  note: '',
})

const years = computed(() => {
  const out: number[] = []
  for (let y = currentYear; y >= currentYear - 4; y--) out.push(y)
  return out
})

async function load() {
  error.value = ''
  try {
    const params = new URLSearchParams({ year: String(year.value) })
    if (auth.isAdmin) params.set('employee_id', selectedId.value)
    absences.value = await api<Absence[]>(`/api/absences?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load absences'
  }
}

onMounted(async () => {
  if (auth.isAdmin) {
    employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
  }
  await load()
})
watch([year, selectedId], load)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const payload: Record<string, unknown> = {
      work_date: form.value.work_date,
      type: form.value.type,
      note: form.value.note || null,
    }
    if (auth.isAdmin) payload.employee_id = selectedId.value
    await api('/api/absences', { method: 'POST', json: payload })
    form.value.note = ''
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    busy.value = false
  }
}

async function remove(a: Absence) {
  if (!confirm(`Remove the ${a.work_date} ${typeLabel(a.type)} record?`)) return
  error.value = ''
  try {
    await api(`/api/absences/${a.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove'
  }
}

const countsByType = computed(() => {
  const c: Record<string, number> = {}
  for (const a of absences.value) c[a.type] = (c[a.type] ?? 0) + 1
  return c
})

const leaveUsed = computed(() => countsByType.value['leave'] ?? 0)

// Whose allowance to show: self from the session, otherwise the picked employee.
const allowance = computed<number | null>(() => {
  if (auth.isAdmin) {
    const e = employees.value.find((x) => x.id === selectedId.value)
    return e?.leave_allowance ?? null
  }
  return auth.user!.leave_allowance
})
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Absences</h2>
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-if="auth.isAdmin"
          v-model="selectedId"
          class="field-input !w-auto"
          aria-label="Employee"
        >
          <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
        <select v-model.number="year" class="field-input mono !w-auto" aria-label="Year">
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <!-- balance / summary -->
    <div class="panel mb-6">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div v-for="t in TYPES" :key="t.value">
          <p class="field-label">{{ t.label }} days</p>
          <p class="mono text-2xl font-semibold">{{ countsByType[t.value] ?? 0 }}</p>
        </div>
      </div>
      <div
        v-if="allowance && allowance > 0"
        class="mt-4 flex flex-wrap gap-6 border-t border-line pt-4"
      >
        <div>
          <p class="field-label">Leave allowance ({{ year }})</p>
          <p class="mono text-xl font-semibold">{{ allowance }} days</p>
        </div>
        <div>
          <p class="field-label">Leave used</p>
          <p class="mono text-xl font-semibold">{{ leaveUsed }} days</p>
        </div>
        <div>
          <p class="field-label">Remaining</p>
          <p
            class="mono text-xl font-semibold"
            :class="allowance - leaveUsed < 0 ? 'text-red' : 'text-teal'"
          >
            {{ allowance - leaveUsed }} days
          </p>
        </div>
      </div>
    </div>

    <!-- log an absence -->
    <div class="panel mb-6">
      <h3 class="display mb-3 text-xl">Record an absence</h3>
      <form class="grid grid-cols-1 gap-4 md:grid-cols-4" @submit.prevent="submit">
        <div>
          <label class="field-label" for="ab-date">Date</label>
          <input
            id="ab-date"
            v-model="form.work_date"
            type="date"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="ab-type">Type</label>
          <select id="ab-type" v-model="form.type" class="field-input">
            <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="field-label" for="ab-note">Note (optional)</label>
          <input
            id="ab-note"
            v-model="form.note"
            maxlength="200"
            class="field-input"
            placeholder="e.g. Approved annual leave"
          />
        </div>
        <div>
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Add' }}
          </button>
        </div>
      </form>
    </div>

    <!-- list -->
    <div class="panel">
      <h3 class="display mb-3 text-xl">Records for {{ year }}</h3>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Date</th>
              <th v-if="auth.isAdmin">Employee</th>
              <th>Type</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in absences" :key="a.id">
              <td class="mono whitespace-nowrap">{{ a.work_date }}</td>
              <td v-if="auth.isAdmin">{{ a.employee_name }}</td>
              <td>
                <span class="display rounded-full border border-line px-2 py-0.5 text-xs tracking-wider">
                  {{ typeLabel(a.type) }}
                </span>
              </td>
              <td class="text-muted">{{ a.note }}</td>
              <td>
                <button class="btn btn-sm btn-danger" @click="remove(a)">Del</button>
              </td>
            </tr>
            <tr v-if="absences.length === 0">
              <td :colspan="auth.isAdmin ? 5 : 4" class="py-6 text-center text-muted">
                No absences recorded for {{ year }}.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
