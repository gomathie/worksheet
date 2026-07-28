<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { useAuthStore } from '../stores/auth'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import {
  EXPENSE_STATUSES,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
  type PaymentMethod,
} from '../../shared/expenses'
import type {
  Department,
  Employee,
  ExpenseCategory,
  ExpenseVoucher,
} from '../types'

const auth = useAuthStore()

const vouchers = ref<ExpenseVoucher[]>([])
const departments = ref<Department[]>([])
const categories = ref<ExpenseCategory[]>([])
const employees = ref<Employee[]>([])
const error = ref('')
const loading = ref(false)

// Anyone who can see beyond their own vouchers gets the employee filter.
const seesOthers = computed(
  () => auth.isAdmin || auth.rights.finance_expenses || auth.rights.review_expenses,
)

const blankFilters = () => ({
  employee_id: '',
  department_id: '',
  category_id: '',
  status: '',
  receipt_available: '',
  from: '',
  to: '',
  amount_min: '',
  amount_max: '',
  q: '',
})
const filters = ref(blankFilters())

const activeFilterCount = computed(
  () => Object.values(filters.value).filter((v) => v !== '').length,
)

async function load() {
  error.value = ''
  loading.value = true
  try {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters.value)) {
      if (value !== '') params.set(key, String(value))
    }
    vouchers.value = await api<ExpenseVoucher[]>(`/api/expenses?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load vouchers'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const [depts, cats] = await Promise.all([
      api<Department[]>('/api/departments'),
      api<ExpenseCategory[]>('/api/expense-categories'),
    ])
    departments.value = depts.filter((d) => d.active)
    categories.value = cats
    if (seesOthers.value) {
      employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
    }
  } catch {
    // Filter dropdowns are a convenience; the list still works without them.
  }
  await load()
})

// Debounce the free-text box so typing does not fire a request per keystroke.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => filters.value.q,
  () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(load, 300)
  },
)
watch(
  () => [
    filters.value.employee_id,
    filters.value.department_id,
    filters.value.category_id,
    filters.value.status,
    filters.value.receipt_available,
    filters.value.from,
    filters.value.to,
    filters.value.amount_min,
    filters.value.amount_max,
  ],
  load,
)

function resetFilters() {
  filters.value = blankFilters()
  load()
}

const totals = computed(() => {
  // Rejected vouchers never counted as spend, so they stay out of the total.
  const billable = vouchers.value.filter((v) => v.status !== 'rejected')
  return {
    count: vouchers.value.length,
    amount: billable.reduce((s, v) => s + v.amount, 0),
    missing: vouchers.value.filter((v) => !v.receipt_available).length,
  }
})

const currency = computed(() => vouchers.value[0]?.currency ?? '')
const money = (n: number, c = currency.value) => `${c}${n.toFixed(2)}`

const methodLabel = (m: string) =>
  PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m

function exportCsv() {
  downloadCsv(`expense-vouchers-${new Date().toISOString().slice(0, 10)}.csv`, [
    [
      'Voucher',
      'Date',
      'Employee',
      'Department',
      'Category',
      'Description',
      'Vendor',
      'Amount',
      'Currency',
      'Payment method',
      'Receipt',
      'Status',
    ],
    ...vouchers.value.map((v) => [
      v.voucher_number,
      v.expense_date,
      v.employee_name ?? '',
      v.department_name ?? '',
      v.category_name ?? '',
      v.description,
      v.vendor ?? '',
      v.amount,
      v.currency,
      methodLabel(v.payment_method),
      v.receipt_available ? 'Yes' : 'No',
      STATUS_LABELS[v.status] ?? v.status,
    ]),
  ])
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Expense vouchers</h2>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm"
          :disabled="vouchers.length === 0"
          @click="exportCsv"
        >
          Export CSV
        </button>
        <RouterLink
          v-if="auth.rights.add_expenses || auth.isAdmin"
          :to="{ name: 'expense-new' }"
          class="btn btn-solid"
          >New voucher</RouterLink
        >
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <!-- ============================================================ filters -->
    <div class="panel mb-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="display text-xl">Search &amp; filter</h3>
        <button v-if="activeFilterCount" class="btn btn-sm" @click="resetFilters">
          Clear {{ activeFilterCount }} filter(s)
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="col-span-2">
          <label class="field-label" for="f-q">Search</label>
          <input
            id="f-q"
            v-model="filters.q"
            class="field-input"
            placeholder="Voucher no., description, vendor"
          />
        </div>
        <div v-if="seesOthers">
          <label class="field-label" for="f-emp">Employee</label>
          <select id="f-emp" v-model="filters.employee_id" class="field-input">
            <option value="">All</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="f-dept">Department</label>
          <select id="f-dept" v-model="filters.department_id" class="field-input">
            <option value="">All</option>
            <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="f-cat">Category</label>
          <select id="f-cat" v-model="filters.category_id" class="field-input">
            <option value="">All</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="f-status">Status</label>
          <select id="f-status" v-model="filters.status" class="field-input">
            <option value="">All</option>
            <option v-for="s in EXPENSE_STATUSES" :key="s" :value="s">
              {{ STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
        <div>
          <label class="field-label" for="f-receipt">Receipt</label>
          <select id="f-receipt" v-model="filters.receipt_available" class="field-input">
            <option value="">Any</option>
            <option value="1">Attached</option>
            <option value="0">Missing</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="f-from">From</label>
          <input id="f-from" v-model="filters.from" type="date" class="field-input mono" />
        </div>
        <div>
          <label class="field-label" for="f-to">To</label>
          <input id="f-to" v-model="filters.to" type="date" class="field-input mono" />
        </div>
        <div>
          <label class="field-label" for="f-min">Min amount</label>
          <input
            id="f-min"
            v-model="filters.amount_min"
            type="number"
            min="0"
            step="0.01"
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="f-max">Max amount</label>
          <input
            id="f-max"
            v-model="filters.amount_max"
            type="number"
            min="0"
            step="0.01"
            class="field-input mono"
          />
        </div>
      </div>
    </div>

    <!-- ============================================================== list -->
    <div class="panel">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 class="display text-xl">
          {{ totals.count }} voucher(s)
          <span v-if="totals.missing" class="text-base text-amber">
            · {{ totals.missing }} without receipt
          </span>
        </h3>
        <p class="mono text-lg font-semibold">{{ money(totals.amount) }}</p>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Date</th>
              <th v-if="seesOthers">Employee</th>
              <th>Category</th>
              <th>Description</th>
              <th class="num">Amount</th>
              <th>Receipt</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in vouchers" :key="v.id">
              <td class="mono whitespace-nowrap text-[13px]">{{ v.voucher_number }}</td>
              <td class="mono whitespace-nowrap">{{ v.expense_date }}</td>
              <td v-if="seesOthers">{{ v.employee_name }}</td>
              <td class="text-xs">{{ v.category_name ?? '—' }}</td>
              <td class="max-w-64 truncate" :title="v.description">
                {{ v.description }}
                <span v-if="v.vendor" class="text-xs text-muted"> · {{ v.vendor }}</span>
              </td>
              <td class="num whitespace-nowrap">{{ money(v.amount, v.currency) }}</td>
              <td class="text-xs">
                <span v-if="v.receipt_available" class="text-teal">
                  Yes<template v-if="v.attachment_count">
                    ({{ v.attachment_count }})</template
                  >
                </span>
                <span v-else class="text-amber">Declared</span>
              </td>
              <td><ExpenseStatusChip :status="v.status" /></td>
              <td>
                <RouterLink
                  :to="{ name: 'expense-detail', params: { id: v.id } }"
                  class="btn btn-sm"
                  >Open</RouterLink
                >
              </td>
            </tr>
            <tr v-if="vouchers.length === 0 && !loading">
              <td :colspan="seesOthers ? 9 : 8" class="py-6 text-center text-muted">
                No vouchers match these filters.
              </td>
            </tr>
            <tr v-if="loading && vouchers.length === 0">
              <td :colspan="seesOthers ? 9 : 8" class="py-6 text-center text-muted">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
