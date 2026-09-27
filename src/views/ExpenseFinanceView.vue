<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { downloadXls } from '../xls'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../../shared/expenses'
import type { ExpenseVoucher } from '../types'

// Recording screen. Recording is not approval and cannot precede it: the queue
// holds only vouchers an approver has already approved, which are booked into
// the external accounting system and marked recorded here.

const vouchers = ref<ExpenseVoucher[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const references = ref<Record<string, string>>({})

async function load() {
  error.value = ''
  try {
    vouchers.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=record')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the recording queue'
  }
}
onMounted(load)

const toRecord = computed(() => vouchers.value.filter((v) => v.status === 'approved'))

const sum = (list: ExpenseVoucher[]) => list.reduce((s, v) => s + v.amount, 0).toFixed(2)
const currency = computed(() => vouchers.value[0]?.currency ?? '')

async function decide(v: ExpenseVoucher, action: 'mark_recorded' | 'keep_in_app') {
  let kept_reason: string | undefined = undefined
  if (action === 'keep_in_app') {
    const input = window.prompt(
      `Keep ${v.voucher_number} in app as internal expense?\n\nOptional reason or note:`,
      '',
    )
    if (input === null) return // cancelled
    kept_reason = input.trim() || undefined
  }
  error.value = ''
  notice.value = ''
  busy.value = v.id
  try {
    await api(`/api/expenses/${v.id}/decision`, {
      method: 'POST',
      json: {
        action,
        recorded_reference: action === 'mark_recorded' ? references.value[v.id] || undefined : undefined,
        kept_reason,
      },
    })
    delete references.value[v.id]
    notice.value =
      action === 'keep_in_app'
        ? `${v.voucher_number} kept in app as internal expense.`
        : `${v.voucher_number} updated.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

const methodLabel = (m: string) => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m

/** Accounting-style export: one row per voucher, ready for the ledger. */
function exportRows() {
  return [
    [
      'Voucher',
      'Expense date',
      'Submitted',
      'Employee',
      'Department',
      'Category',
      'Description',
      'Vendor',
      'Payment method',
      'Amount',
      'Currency',
      'Status',
    ],
    ...vouchers.value.map((v) => [
      v.voucher_number,
      v.expense_date,
      v.submission_date ?? '',
      v.employee_name ?? '',
      v.department_name ?? '',
      v.category_name ?? '',
      v.description,
      v.vendor ?? '',
      methodLabel(v.payment_method),
      v.amount,
      v.currency,
      v.status,
    ]),
  ]
}

const stamp = () => new Date().toISOString().slice(0, 10)
const exportCsv = () => downloadCsv(`expense-accounting-${stamp()}.csv`, exportRows())
const exportXls = () =>
  downloadXls(`expense-accounting-${stamp()}.xls`, exportRows(), 'Expenses')
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Expenses to record</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          :to="{ name: 'expense-reports', query: { type: 'kept_in_app' } }"
          class="btn btn-sm"
        >
          Kept in app report
        </RouterLink>
        <button class="btn btn-sm" :disabled="vouchers.length === 0" @click="exportCsv">
          Export CSV
        </button>
        <button class="btn btn-sm" :disabled="vouchers.length === 0" @click="exportXls">
          Export Excel
        </button>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="panel">
        <p class="field-label">Approved, to record</p>
        <p class="stat-figure text-teal">{{ toRecord.length }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Value to record</p>
        <p class="stat-figure">{{ currency }}{{ sum(toRecord) }}</p>
      </div>
    </div>

    <!-- ======================================================== recording -->
    <h3 class="display mb-1 text-xl">Approved — to record</h3>
    <p class="mb-3 text-sm text-muted">
      Approved by an administrator. Enter each into the external finance records,
      then mark it recorded here, or choose Keep in app if it should remain an internal expense.
    </p>
    <p v-if="toRecord.length === 0" class="panel text-muted">
      Nothing awaiting recording.
    </p>

    <div v-if="toRecord.length" class="panel">
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Employee</th>
              <th>Date</th>
              <th>Category</th>
              <th class="num">Amount</th>
              <th>Finance record reference</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in toRecord" :key="v.id">
              <td class="mono whitespace-nowrap text-[13px]">
                <RouterLink
                  :to="{ name: 'expense-detail', params: { id: v.id } }"
                  class="underline"
                  >{{ v.voucher_number }}</RouterLink
                >
              </td>
              <td>{{ v.employee_name }}</td>
              <td class="mono whitespace-nowrap">{{ v.expense_date }}</td>
              <td class="text-xs">{{ v.category_name ?? '—' }}</td>
              <td class="num whitespace-nowrap font-semibold">
                {{ v.currency }}{{ v.amount.toFixed(2) }}
              </td>
              <td>
                <input
                  v-model="references[v.id]"
                  maxlength="120"
                  class="field-input mono !w-40"
                  placeholder="e.g. JE-2026-114"
                  :aria-label="`Finance record reference for ${v.voucher_number}`"
                />
              </td>
              <td class="whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                  <button
                    class="btn btn-sm btn-solid whitespace-nowrap"
                    :disabled="busy === v.id"
                    @click="decide(v, 'mark_recorded')"
                  >
                    Mark recorded
                  </button>
                  <button
                    class="btn btn-sm whitespace-nowrap"
                    :disabled="busy === v.id"
                    title="Keep this voucher in the app without recording externally"
                    @click="decide(v, 'keep_in_app')"
                  >
                    Keep in app
                  </button>
                </div>
              </td>
            </tr>
            <tr class="totals">
              <td colspan="4">Total</td>
              <td class="num">{{ currency }}{{ sum(toRecord) }}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
