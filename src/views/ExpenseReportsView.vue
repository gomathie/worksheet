<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { downloadXls } from '../xls'
import MonthPicker from '../components/MonthPicker.vue'
import { useAuthStore } from '../stores/auth'
import { STATUS_LABELS } from '../../shared/expenses'
import type { ExpenseDashboard, ExpenseReport } from '../types'

const auth = useAuthStore()

const month = ref(auth.user!.today.slice(0, 7))
const dashboard = ref<ExpenseDashboard | null>(null)
const report = ref<ExpenseReport | null>(null)
const error = ref('')
const loading = ref(false)

const REPORTS = [
  { type: 'monthly', label: 'Monthly expenses' },
  { type: 'department', label: 'Department expenses' },
  { type: 'employee', label: 'Employee expenses' },
  { type: 'outstanding', label: 'Outstanding reimbursements' },
  { type: 'approved_vs_rejected', label: 'Approved vs rejected' },
] as const

const reportType = ref<(typeof REPORTS)[number]['type']>('monthly')
// Default range: the trailing twelve months, so the first load is not empty.
const range = ref({ from: '', to: auth.user!.today })

function initRange() {
  const [y, m] = month.value.split('-').map(Number)
  range.value.from = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10)
  range.value.to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

async function loadDashboard() {
  try {
    dashboard.value = await api<ExpenseDashboard>(`/api/expenses/dashboard?month=${month.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the dashboard'
  }
}

async function loadReport() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      type: reportType.value,
      from: range.value.from,
      to: range.value.to,
    })
    report.value = await api<ExpenseReport>(`/api/expenses/reports?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the report'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  initRange()
  error.value = ''
  await Promise.all([loadDashboard(), loadReport()])
})

watch(month, async () => {
  error.value = ''
  initRange()
  await Promise.all([loadDashboard(), loadReport()])
})
watch([reportType, () => range.value.from, () => range.value.to], () => {
  error.value = ''
  loadReport()
})

const currency = computed(() => dashboard.value?.currency ?? '')
const money = (n: number) => `${currency.value}${n.toFixed(2)}`

// The report endpoint returns whatever columns its SQL selected, so the table
// renders generically from the first row's keys.
const columns = computed(() => (report.value?.rows.length ? Object.keys(report.value.rows[0]) : []))

const columnLabel = (key: string) =>
  key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const isMoneyColumn = (key: string) => /amount/.test(key)

function cellValue(row: Record<string, string | number | null>, key: string): string {
  const v = row[key]
  if (v === null || v === undefined) return '—'
  if (isMoneyColumn(key) && typeof v === 'number') return money(v)
  if (key === 'status') return STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? String(v)
  if (key === 'declaration_accepted') return v ? 'Accepted' : 'Not accepted'
  return String(v)
}

function exportRows() {
  return [
    columns.value.map(columnLabel),
    ...(report.value?.rows ?? []).map((r) => columns.value.map((c) => r[c] ?? '')),
  ]
}

const activeLabel = computed(
  () => REPORTS.find((r) => r.type === reportType.value)?.label ?? 'Report',
)
const stamp = () => `${reportType.value}-${range.value.from}-to-${range.value.to}`
const exportCsv = () => downloadCsv(`expenses-${stamp()}.csv`, exportRows())
const exportXls = () => downloadXls(`expenses-${stamp()}.xls`, exportRows(), activeLabel.value)
const printPage = () => window.print()

/** Bar width relative to the biggest bucket, for the breakdown lists. */
const share = (amount: number, buckets: { amount: number }[]) => {
  const max = Math.max(...buckets.map((b) => b.amount), 0)
  return max > 0 ? `${Math.round((amount / max) * 100)}%` : '0%'
}
</script>

<template>
  <div>
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Expense reporting</h2>
      <MonthPicker v-model="month" />
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <!-- ========================================================= dashboard -->
    <template v-if="dashboard">
      <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="panel">
          <p class="field-label">Pending approval</p>
          <p class="mono text-3xl font-semibold text-amber">
            {{ dashboard.pending_approval }}
          </p>
        </div>
        <div class="panel">
          <p class="field-label">Approved</p>
          <p class="mono text-3xl font-semibold text-teal">{{ dashboard.approved }}</p>
        </div>
        <div class="panel">
          <p class="field-label">Rejected</p>
          <p class="mono text-3xl font-semibold text-red">{{ dashboard.rejected }}</p>
        </div>
        <div class="panel">
          <p class="field-label">Recorded</p>
          <p class="mono text-3xl font-semibold text-teal">{{ dashboard.recorded }}</p>
        </div>
      </div>

      <div class="mb-6 flex flex-wrap items-stretch gap-4">
        <div
          class="display flex h-36 w-36 shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-4 border-teal px-2 text-center text-teal"
        >
          <span class="mono text-2xl font-semibold">
            {{ money(dashboard.total_this_month) }}
          </span>
          <span class="text-xs tracking-widest">This month</span>
        </div>
        <div class="grid flex-1 grid-cols-1 gap-4">
          <div class="panel">
            <p class="field-label">Total (12 months, excl. rejected)</p>
            <p class="mono text-3xl font-semibold">{{ money(dashboard.total_amount) }}</p>
          </div>
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="panel">
          <h3 class="display mb-3 text-xl">Expenses by category</h3>
          <ul v-if="dashboard.by_category.length" class="space-y-2 text-sm">
            <li v-for="b in dashboard.by_category" :key="b.key">
              <div class="flex justify-between gap-2">
                <span>{{ b.label }}</span>
                <span class="mono">{{ money(b.amount) }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded bg-line">
                <div
                  class="h-1.5 rounded bg-chart-teal"
                  :style="{ width: share(b.amount, dashboard.by_category) }"
                />
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">No data yet.</p>
        </div>

        <div class="panel">
          <h3 class="display mb-3 text-xl">Expenses by employee</h3>
          <ul v-if="dashboard.by_employee.length" class="space-y-2 text-sm">
            <li v-for="b in dashboard.by_employee" :key="b.key">
              <div class="flex justify-between gap-2">
                <span>{{ b.label }}</span>
                <span class="mono">{{ money(b.amount) }}</span>
              </div>
              <div class="mt-1 h-1.5 rounded bg-line">
                <div
                  class="h-1.5 rounded bg-chart-amber"
                  :style="{ width: share(b.amount, dashboard.by_employee) }"
                />
              </div>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">No data yet.</p>
        </div>
      </div>
    </template>

    <!-- ============================================================ reports -->
    <div class="panel">
      <div class="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="field-label" for="r-type">Report</label>
            <select id="r-type" v-model="reportType" class="field-input !w-auto">
              <option v-for="r in REPORTS" :key="r.type" :value="r.type">
                {{ r.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="field-label" for="r-from">From</label>
            <input
              id="r-from"
              v-model="range.from"
              type="date"
              class="field-input mono !w-auto"
            />
          </div>
          <div>
            <label class="field-label" for="r-to">To</label>
            <input id="r-to" v-model="range.to" type="date" class="field-input mono !w-auto" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm" :disabled="!report?.rows.length" @click="exportCsv">
            CSV
          </button>
          <button class="btn btn-sm" :disabled="!report?.rows.length" @click="exportXls">
            Excel
          </button>
          <button class="btn btn-sm" @click="printPage">PDF</button>
        </div>
      </div>

      <header class="mb-4 border-b-2 border-ink pb-3">
        <h3 class="display text-2xl">{{ activeLabel }}</h3>
        <p class="text-sm text-muted">
          <span class="mono">{{ range.from }}</span> to
          <span class="mono">{{ range.to }}</span>
        </p>
      </header>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th
                v-for="c in columns"
                :key="c"
                :class="{ num: isMoneyColumn(c) || /count|vouchers|receipts/.test(c) }"
              >
                {{ columnLabel(c) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in report?.rows ?? []" :key="i">
              <td
                v-for="c in columns"
                :key="c"
                :class="{ num: isMoneyColumn(c) || /count|vouchers|receipts/.test(c) }"
              >
                {{ cellValue(row, c) }}
              </td>
            </tr>
            <tr v-if="!loading && report && report.rows.length === 0">
              <td :colspan="Math.max(columns.length, 1)" class="py-6 text-center text-muted">
                Nothing in this range.
              </td>
            </tr>
            <tr v-if="loading">
              <td :colspan="Math.max(columns.length, 1)" class="py-6 text-center text-muted">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="mt-4 border-t border-line pt-3 text-xs text-muted">
        Money totals exclude rejected vouchers. Generated
        {{ new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }}.
      </footer>
    </div>
  </div>
</template>
