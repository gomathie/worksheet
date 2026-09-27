<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import type { Employee, PointDeduction } from '../types'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const deductions = ref<PointDeduction[]>([])
const employees = ref<Employee[]>([])
const loading = ref(false)
const error = ref('')

const month = ref(new Date().toISOString().slice(0, 7))
const selectedEmployeeId = ref('')
const selectedDecision = ref<'all' | 'deducted' | 'let_it_go'>('all')

async function loadEmployees() {
  try {
    employees.value = await api<Employee[]>('/api/employees')
  } catch {
    // Non-fatal if employee list fails
  }
}

async function loadDeductions() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (month.value) params.set('month', month.value)
    if (selectedEmployeeId.value) params.set('employee_id', selectedEmployeeId.value)
    
    const query = params.toString() ? `?${params.toString()}` : ''
    const data = await api<PointDeduction[]>(`/api/point-deductions${query}`)
    deductions.value = data
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load deductions'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (auth.user?.rights.manage_point_deductions || auth.user?.role === 'admin') {
    loadEmployees()
    loadDeductions()
  }
})

watch([month, selectedEmployeeId], () => {
  loadDeductions()
})

const filteredDeductions = computed(() => {
  if (selectedDecision.value === 'all') return deductions.value
  return deductions.value.filter((d) => d.decision === selectedDecision.value)
})

const stats = computed(() => {
  const list = filteredDeductions.value
  const totalDeducted = list
    .filter((d) => d.decision === 'deducted')
    .reduce((sum, d) => sum + d.amount, 0)
  const penaltyCount = list.filter((d) => d.decision === 'deducted').length
  const pardonCount = list.filter((d) => d.decision === 'let_it_go').length
  const uniqueEmployees = new Set(list.map((d) => d.employee_id)).size

  return {
    totalDeducted: Math.round(totalDeducted * 100) / 100,
    penaltyCount,
    pardonCount,
    uniqueEmployees,
  }
})

function exportCsv() {
  const headers = [
    'Date',
    'Employee',
    'Admin',
    'Decision',
    'Amount',
    'Previous Balance',
    'New Balance',
    'Reason',
    'Task ID',
    'Warning Ref',
  ]
  const rows = filteredDeductions.value.map((d) => [
    `"${d.created_at}"`,
    `"${d.employee_name ?? d.employee_id}"`,
    `"${d.admin_name ?? d.admin_id}"`,
    `"${d.decision}"`,
    d.amount,
    d.previous_balance,
    d.new_balance,
    `"${(d.reason ?? '').replace(/"/g, '""')}"`,
    `"${d.task_id ?? ''}"`,
    `"${d.warning_ref ?? ''}"`,
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `point-deductions-${month.value || 'all'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="display text-3xl">Point Deductions &amp; Penalties</h1>
        <p class="text-sm text-muted">
          Audit log and transaction history for employee point deductions and disciplinary decisions.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn text-sm"
          :disabled="filteredDeductions.length === 0"
          @click="exportCsv"
        >
          📥 Export CSV
        </button>
      </div>
    </div>

    <!-- Permission Warning -->
    <div
      v-if="!auth.user?.rights.manage_point_deductions && auth.user?.role !== 'admin'"
      class="panel rounded-lg border border-red bg-red-soft p-4 text-red"
    >
      You do not have permission to view point deductions.
    </div>

    <template v-else>
      <!-- Stat Cards -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="panel p-4">
          <div class="text-xs uppercase text-muted">Total Points Deducted</div>
          <div class="display mt-1 text-2xl font-bold text-amber">
            -{{ stats.totalDeducted }}
          </div>
          <div class="text-[11px] text-muted">{{ stats.penaltyCount }} penalty actions</div>
        </div>

        <div class="panel p-4">
          <div class="text-xs uppercase text-muted">Pardons Recorded</div>
          <div class="display mt-1 text-2xl font-bold text-teal">
            {{ stats.pardonCount }}
          </div>
          <div class="text-[11px] text-muted">"Let it go" decisions</div>
        </div>

        <div class="panel p-4">
          <div class="text-xs uppercase text-muted">Employees Affected</div>
          <div class="display mt-1 text-2xl font-bold text-ink">
            {{ stats.uniqueEmployees }}
          </div>
          <div class="text-[11px] text-muted">Distinct team members</div>
        </div>

        <div class="panel p-4">
          <div class="text-xs uppercase text-muted">Total Audit Records</div>
          <div class="display mt-1 text-2xl font-bold text-ink">
            {{ filteredDeductions.length }}
          </div>
          <div class="text-[11px] text-muted">In selected filters</div>
        </div>
      </div>

      <!-- Filters Panel -->
      <div class="panel p-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="field-label block mb-1">Month</label>
            <input
              v-model="month"
              type="month"
              class="w-full rounded border border-line bg-paper px-3 py-1.5 mono text-sm"
            />
          </div>

          <div>
            <label class="field-label block mb-1">Employee</label>
            <select
              v-model="selectedEmployeeId"
              class="w-full rounded border border-line bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">All employees</option>
              <option v-for="e in employees" :key="e.id" :value="e.id">
                {{ e.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="field-label block mb-1">Decision Type</label>
            <select
              v-model="selectedDecision"
              class="w-full rounded border border-line bg-paper px-3 py-1.5 text-sm"
            >
              <option value="all">All decisions</option>
              <option value="deducted">Penalties only (deducted)</option>
              <option value="let_it_go">Pardons only (let it go)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Deductions History Table -->
      <div class="panel">
        <div class="flex items-center justify-between mb-4">
          <h2 class="display text-xl">Deduction History</h2>
          <span v-if="loading" class="text-xs text-teal animate-pulse">Loading records…</span>
        </div>

        <p v-if="error" class="mb-4 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
          {{ error }}
        </p>

        <div v-if="filteredDeductions.length === 0 && !loading" class="py-12 text-center text-sm text-muted">
          No point deduction records found for the selected filters.
        </div>

        <div v-else class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Authorized By</th>
                <th>Action</th>
                <th>Amount</th>
                <th>Balance Shift</th>
                <th>Reason</th>
                <th>References</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in filteredDeductions" :key="d.id">
                <td class="mono text-xs whitespace-nowrap">
                  {{ d.created_at.slice(0, 16).replace('T', ' ') }}
                </td>
                <td class="font-medium">
                  {{ d.employee_name ?? d.employee_id }}
                </td>
                <td class="text-xs text-muted">
                  {{ d.admin_name ?? d.admin_id }}
                </td>
                <td>
                  <span
                    class="rounded-full border px-2 py-0.5 text-xs font-semibold"
                    :class="
                      d.decision === 'deducted'
                        ? 'border-red/40 bg-red-soft/40 text-red'
                        : 'border-teal/40 bg-teal-soft/40 text-teal'
                    "
                  >
                    {{ d.decision === 'deducted' ? 'Penalty' : 'Pardon' }}
                  </span>
                </td>
                <td class="mono font-bold whitespace-nowrap">
                  <span v-if="d.decision === 'deducted'" class="text-red">
                    -{{ d.amount }} pts
                  </span>
                  <span v-else class="text-muted">
                    0 pts
                  </span>
                </td>
                <td class="mono text-xs text-muted whitespace-nowrap">
                  {{ d.previous_balance }} →
                  <strong :class="d.new_balance < d.previous_balance ? 'text-ink' : ''">
                    {{ d.new_balance }}
                  </strong>
                </td>
                <td class="text-sm max-w-xs break-words">
                  {{ d.reason }}
                </td>
                <td class="text-xs mono text-muted">
                  <div v-if="d.task_id" title="Task ID">
                    📋 {{ d.task_id.slice(0, 8) }}…
                  </div>
                  <div v-if="d.warning_ref" title="Warning Reference">
                    ⚠️ {{ d.warning_ref }}
                  </div>
                  <span v-if="!d.task_id && !d.warning_ref">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
