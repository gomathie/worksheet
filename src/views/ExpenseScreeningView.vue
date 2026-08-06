<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import {
  PAYMENT_METHOD_LABELS,
  FUNDING_SOURCE_LABELS,
  type FundingSource,
  type PaymentMethod,
} from '../../shared/expenses'
import type { Adjustment, ExpenseVoucher } from '../types'

// Screening desk. Screening is not approval: everything here is checked and
// either put in front of an approver or sent back for more information. The
// same holder screens the reimbursements those vouchers raised.

const vouchers = ref<ExpenseVoucher[]>([])
const claims = ref<Adjustment[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const comments = ref<Record<string, string>>({})

async function load() {
  error.value = ''
  try {
    ;[vouchers.value, claims.value] = await Promise.all([
      api<ExpenseVoucher[]>('/api/expenses/queue?queue=screening'),
      api<Adjustment[]>('/api/adjustments/pending-reimbursements').catch(() => []),
    ])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the screening queue'
  }
}
onMounted(load)

const total = computed(() =>
  vouchers.value.reduce((s, v) => s + v.amount, 0).toFixed(2),
)
const currency = computed(() => vouchers.value[0]?.currency ?? '')

async function decide(v: ExpenseVoucher, action: 'request_approval' | 'return') {
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
      json: { action, comments: comment || undefined },
    })
    delete comments.value[v.id]
    notice.value = `${v.voucher_number} updated.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

/** Put a raised reimbursement in front of an approver. */
async function screenClaim(a: Adjustment) {
  error.value = ''
  notice.value = ''
  busy.value = a.id
  try {
    await api(`/api/adjustments/${a.id}`, {
      method: 'PATCH',
      json: { status: 'awaiting_approval' },
    })
    notice.value = 'Reimbursement sent for approval.'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

const methodLabel = (m: string) => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m
const fundingLabel = (v: ExpenseVoucher) =>
  FUNDING_SOURCE_LABELS[(v.funding_source ?? 'own_pocket') as FundingSource] ?? '—'
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Screening</h2>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="panel">
        <p class="field-label">Vouchers to screen</p>
        <p class="stat-figure">{{ vouchers.length }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Value</p>
        <p class="stat-figure">{{ currency }}{{ total }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Reimbursements to screen</p>
        <p class="stat-figure text-amber">{{ claims.length }}</p>
      </div>
    </div>

    <!-- ==================================================== expense vouchers -->
    <h3 class="display mb-1 text-xl">Submitted vouchers</h3>
    <p class="mb-3 text-sm text-muted">
      Check the voucher, then send it to an approver — or return it for more
      information. Screening does not approve anything.
    </p>
    <p v-if="vouchers.length === 0" class="panel mb-6 text-muted">
      Nothing waiting to be screened.
    </p>

    <div v-for="v in vouchers" :key="v.id" class="panel mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <RouterLink
            :to="{ name: 'expense-detail', params: { id: v.id } }"
            class="display text-xl underline"
            >{{ v.voucher_number }}</RouterLink
          >
          <ExpenseStatusChip :status="v.status" />
          <span
            v-if="v.duplicate_count"
            class="display rounded-full border border-amber px-2 py-0.5 text-xs tracking-wider text-amber"
            :title="`${v.duplicate_count} similar claim(s) by the same employee`"
            >Possible duplicate</span
          >
        </div>
        <p class="mono text-2xl font-semibold">
          {{ v.currency }}{{ v.amount.toFixed(2) }}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p class="field-label">Employee</p>
          <p>{{ v.employee_name }}</p>
        </div>
        <div>
          <p class="field-label">Funded from</p>
          <p>{{ fundingLabel(v) }}</p>
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
        <label class="field-label" :for="`sc-${v.id}`">Comments</label>
        <textarea
          :id="`sc-${v.id}`"
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
            Send for approval
          </button>
          <button class="btn" :disabled="busy === v.id" @click="decide(v, 'return')">
            Request more info
          </button>
        </div>
      </div>
    </div>

    <!-- ====================================================== reimbursements -->
    <template v-if="claims.length">
      <h3 class="display mt-6 mb-1 text-xl">Reimbursements raised</h3>
      <p class="mb-3 text-sm text-muted">
        Claims for money employees advanced themselves. Sending one for approval
        puts it in front of an administrator; it is not approved here.
      </p>
      <div class="panel">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Month</th>
                <th>For</th>
                <th class="num">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in claims" :key="a.id">
                <td>{{ a.employee_name }}</td>
                <td class="mono whitespace-nowrap">{{ a.month }}</td>
                <td class="text-xs">{{ a.description ?? '—' }}</td>
                <td class="num whitespace-nowrap font-semibold">
                  {{ a.amount.toFixed(2) }}
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-solid whitespace-nowrap"
                    :disabled="busy === a.id"
                    @click="screenClaim(a)"
                  >
                    Send for approval
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
