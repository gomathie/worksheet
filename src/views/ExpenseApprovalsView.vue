<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import type { ExpenseVoucher } from '../types'

// Two queues on one page:
//   manager  — vouchers from the reviewer's direct reports awaiting review
//   approver — vouchers awaiting final approval (admin + approve_expenses)
// Both are scoped server-side.

const auth = useAuthStore()

const vouchers = ref<ExpenseVoucher[]>([])
const approvals = ref<ExpenseVoucher[]>([])
const error = ref('')
const notice = ref('')
const busy = ref('')
const comments = ref<Record<string, string>>({})

const isManager = computed(() => auth.rights.review_expenses)
// Approval requires the admin role as well as the right.
const isApprover = computed(() => auth.isAdmin && auth.rights.approve_expenses)

async function load() {
  error.value = ''
  try {
    if (isManager.value) {
      vouchers.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=manager')
    }
    if (isApprover.value) {
      approvals.value = await api<ExpenseVoucher[]>('/api/expenses/queue?queue=approver')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the approval queue'
  }
}
onMounted(load)

type Decision =
  | 'manager_approve'
  | 'manager_reject'
  | 'admin_approve'
  | 'admin_reject'
  | 'return'

const PAST_TENSE: Record<Decision, string> = {
  manager_approve: 'approved',
  admin_approve: 'approved',
  manager_reject: 'rejected',
  admin_reject: 'rejected',
  return: 'returned',
}

async function decide(v: ExpenseVoucher, action: Decision) {
  const comment = (comments.value[v.id] ?? '').trim()
  const needsComment =
    action === 'manager_reject' || action === 'admin_reject' || action === 'return'
  if (needsComment && !comment) {
    error.value =
      action === 'return'
        ? 'Say what additional information is needed.'
        : 'A comment is required when rejecting a voucher.'
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
    notice.value = `${v.voucher_number} ${PAST_TENSE[action]}.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = ''
  }
}

const total = computed(() =>
  vouchers.value.reduce((s, v) => s + v.amount, 0).toFixed(2),
)
const currency = computed(
  () => vouchers.value[0]?.currency ?? approvals.value[0]?.currency ?? '',
)
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Expense approvals</h2>
      <p v-if="vouchers.length" class="mono text-lg">
        {{ vouchers.length }} waiting · {{ currency }}{{ total }}
      </p>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <p v-if="vouchers.length === 0" class="panel text-muted">
      Nothing is waiting for your review.
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
          <p class="field-label">Date of expense</p>
          <p class="mono">{{ v.expense_date }}</p>
        </div>
        <div>
          <p class="field-label">Category</p>
          <p>{{ v.category_name ?? '—' }}</p>
        </div>
        <div>
          <p class="field-label">Submitted</p>
          <p class="mono">{{ v.submission_date ?? '—' }}</p>
        </div>
      </div>

      <div class="mt-3">
        <p class="field-label">Purpose</p>
        <p class="whitespace-pre-wrap text-sm">{{ v.description }}</p>
      </div>

      <div
        v-if="!v.receipt_available"
        class="mt-3 rounded-lg border border-amber bg-amber-soft p-3 text-sm"
      >
        <p class="field-label">Reason no receipt is available</p>
        <p>{{ v.missing_receipt_reason ?? '—' }}</p>
        <p class="mt-1 text-xs" :class="v.declaration_accepted ? 'text-teal' : 'text-red'">
          {{
            v.declaration_accepted
              ? 'Employee accepted the declaration.'
              : 'Declaration not accepted.'
          }}
        </p>
      </div>

      <div class="mt-4 border-t border-line pt-3">
        <label class="field-label" :for="`c-${v.id}`">Comments</label>
        <textarea
          :id="`c-${v.id}`"
          v-model="comments[v.id]"
          rows="2"
          maxlength="1000"
          class="field-input mb-3"
          placeholder="Required when rejecting or requesting more information"
        />
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-solid"
            :disabled="busy === v.id"
            @click="decide(v, 'manager_approve')"
          >
            Approve
          </button>
          <button class="btn" :disabled="busy === v.id" @click="decide(v, 'return')">
            Request more info
          </button>
          <button
            class="btn btn-danger"
            :disabled="busy === v.id"
            @click="decide(v, 'manager_reject')"
          >
            Reject
          </button>
          <RouterLink
            :to="{ name: 'expense-detail', params: { id: v.id } }"
            class="btn"
            >Open</RouterLink
          >
        </div>
      </div>
    </div>
  </div>
</template>
