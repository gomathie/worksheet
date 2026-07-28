<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { downloadXls } from '../xls'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../../shared/expenses'
import type { ExpenseVoucher } from '../types'

// Finance screen. Finance does not approve: it escalates a voucher to an
// administrator holding the approval right, and once approved records it in
// the external accounting system. The queue returns every stage finance
// touches so the whole pipeline is visible.

const vouchers = ref<ExpenseVoucher[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const comments = ref<Record<string, string>>({})
const references = ref<Record<string, string>>({})

async function load() {
  error.value = ''
  try {
    vouchers.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=finance')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the finance queue'
  }
}
onMounted(load)

const toEscalate = computed(() =>
  vouchers.value.filter((v) => v.status === 'finance_review'),
)
const awaitingApproval = computed(() =>
  vouchers.value.filter((v) => v.status === 'admin_approval'),
)
const toRecord = computed(() => vouchers.value.filter((v) => v.status === 'approved'))

const sum = (list: ExpenseVoucher[]) => list.reduce((s, v) => s + v.amount, 0).toFixed(2)
const currency = computed(() => vouchers.value[0]?.currency ?? '')

async function decide(
  v: ExpenseVoucher,
  action: 'request_approval' | 'return' | 'mark_recorded',
) {
  const comment = (comments.value[v.id] ?? '').trim()
  if (action === 'return' && !comment) {
    error.value = 'Say what additional information is needed.'
    return
  }
  error.value = ''
  notice.value = ''
  busy.value = v.id
  try {
    await api(`/api/expenses/${v.id}/decision`, {
      method: 'POST',
      json: {
        action,
        comments: comment || undefined,
        recorded_reference:
          action === 'mark_recorded' ? references.value[v.id] || undefined : undefined,
      },
    })
    delete comments.value[v.id]
    delete references.value[v.id]
    notice.value = `${v.voucher_number} updated.`
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
      'Receipt',
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
      v.receipt_available ? 'Yes' : 'Declared',
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
      <h2 class="display text-2xl">Finance — expense records</h2>
      <div class="flex flex-wrap gap-2">
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

    <div class="mb-6 grid grid-cols-3 gap-4">
      <div class="panel">
        <p class="field-label">To send for approval</p>
        <p class="mono text-3xl font-semibold">{{ toEscalate.length }}</p>
        <p class="mono text-sm text-muted">{{ currency }}{{ sum(toEscalate) }}</p>
      </div>
      <div class="panel">
        <p class="field-label">With the approver</p>
        <p class="mono text-3xl font-semibold text-amber">
          {{ awaitingApproval.length }}
        </p>
        <p class="mono text-sm text-muted">{{ currency }}{{ sum(awaitingApproval) }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Approved, to record</p>
        <p class="mono text-3xl font-semibold text-teal">{{ toRecord.length }}</p>
        <p class="mono text-sm text-muted">{{ currency }}{{ sum(toRecord) }}</p>
      </div>
    </div>

    <!-- ================================================ send for approval -->
    <h3 class="display mb-1 text-xl">To send for approval</h3>
    <p class="mb-3 text-sm text-muted">
      Finance does not approve expenses. Check the voucher, then send it to an
      administrator holding approval rights — or return it for more information.
    </p>
    <p v-if="toEscalate.length === 0" class="panel mb-6 text-muted">
      Nothing waiting to be sent for approval.
    </p>

    <div v-for="v in toEscalate" :key="v.id" class="panel mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <RouterLink
            :to="{ name: 'expense-detail', params: { id: v.id } }"
            class="display text-xl underline"
            >{{ v.voucher_number }}</RouterLink
          >
          <ExpenseStatusChip :status="v.status" />
          <span
            v-if="!v.receipt_available"
            class="display rounded-full border border-amber px-2 py-0.5 text-xs tracking-wider text-amber"
            >No receipt</span
          >
        </div>
        <p class="mono text-2xl font-semibold">{{ v.currency }}{{ v.amount.toFixed(2) }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p class="field-label">Employee</p>
          <p>{{ v.employee_name }}</p>
        </div>
        <div>
          <p class="field-label">Department</p>
          <p>{{ v.department_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Category</p>
          <p>{{ v.category_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Method</p>
          <p>{{ methodLabel(v.payment_method) }}</p>
        </div>
      </div>

      <p class="mt-3 text-sm">{{ v.description }}</p>

      <div class="mt-4 border-t border-line pt-3">
        <label class="field-label" :for="`fc-${v.id}`">Comments</label>
        <textarea
          :id="`fc-${v.id}`"
          v-model="comments[v.id]"
          rows="2"
          maxlength="1000"
          class="field-input mb-3"
        />
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-solid"
            :disabled="busy === v.id"
            @click="decide(v, 'request_approval')"
          >
            Request approval
          </button>
          <button class="btn" :disabled="busy === v.id" @click="decide(v, 'return')">
            Request more info
          </button>
        </div>
      </div>
    </div>

    <!-- ================================================ with the approver -->
    <template v-if="awaitingApproval.length">
      <h3 class="display mb-1 text-xl">With the approver</h3>
      <p class="mb-3 text-sm text-muted">
        Sent for administrator approval. Nothing can be recorded until it is
        approved.
      </p>
      <div class="panel mb-6">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Employee</th>
                <th>Date</th>
                <th class="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in awaitingApproval" :key="v.id">
                <td class="mono whitespace-nowrap text-[13px]">
                  <RouterLink
                    :to="{ name: 'expense-detail', params: { id: v.id } }"
                    class="underline"
                    >{{ v.voucher_number }}</RouterLink
                  >
                </td>
                <td>{{ v.employee_name }}</td>
                <td class="mono whitespace-nowrap">{{ v.expense_date }}</td>
                <td class="num whitespace-nowrap">
                  {{ v.currency }}{{ v.amount.toFixed(2) }}
                </td>
                <td><ExpenseStatusChip :status="v.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ======================================================== recording -->
    <h3 class="display mb-1 text-xl">Approved — to record</h3>
    <p class="mb-3 text-sm text-muted">
      Approved by an administrator. Enter each into the external finance records,
      then mark it recorded here.
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
              <td>
                <button
                  class="btn btn-sm btn-solid whitespace-nowrap"
                  :disabled="busy === v.id"
                  @click="decide(v, 'mark_recorded')"
                >
                  Mark recorded
                </button>
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
