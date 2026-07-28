<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import {
  DEFAULT_DECLARATION,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  validateVoucher,
} from '../../shared/expenses'
import type {
  Department,
  Employee,
  ExpenseCategory,
  ExpenseVoucherDetail,
} from '../types'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const editingId = computed(() => (route.params.id as string | undefined) ?? null)

const departments = ref<Department[]>([])
const categories = ref<ExpenseCategory[]>([])
const employees = ref<Employee[]>([])
const currency = ref('$')
const error = ref('')
const busy = ref(false)
const loaded = ref(false)

const form = ref({
  employee_id: auth.user!.id,
  department_id: '' as string | null,
  expense_date: auth.user!.today,
  category_id: '' as string | null,
  description: '',
  vendor: '',
  amount: '' as string | number,
  currency: '$',
  payment_method: 'cash',
  receipt_available: false,
  missing_receipt_reason: '',
  declaration_accepted: false,
})

/** Live client-side mirror of the server rules, shown once the user submits. */
const showIssues = ref(false)
const issues = computed(() =>
  validateVoucher(
    {
      expense_date: form.value.expense_date,
      description: form.value.description,
      amount: Number(form.value.amount),
      currency: form.value.currency,
      payment_method: form.value.payment_method,
      receipt_available: form.value.receipt_available,
      missing_receipt_reason: form.value.missing_receipt_reason,
      declaration_accepted: form.value.declaration_accepted,
    },
    auth.user!.today,
    true,
  ),
)
const issueFor = (field: string) =>
  showIssues.value ? issues.value.find((i) => i.field === field)?.message : undefined

onMounted(async () => {
  try {
    const [depts, cats, settings] = await Promise.all([
      api<Department[]>('/api/departments'),
      api<ExpenseCategory[]>('/api/expense-categories'),
      api<{ currency: string }>('/api/settings'),
    ])
    departments.value = depts.filter((d) => d.active)
    categories.value = cats.filter((c) => c.active)
    currency.value = settings.currency ?? '$'
    form.value.currency = currency.value
    if (auth.isAdmin) {
      employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
    }

    if (editingId.value) {
      const v = await api<ExpenseVoucherDetail>(`/api/expenses/${editingId.value}`)
      if (!v.actions.includes('edit')) {
        error.value = 'This voucher can no longer be edited.'
      }
      form.value = {
        employee_id: v.employee_id,
        department_id: v.department_id,
        expense_date: v.expense_date,
        category_id: v.category_id,
        description: v.description,
        vendor: v.vendor ?? '',
        amount: v.amount,
        currency: v.currency,
        payment_method: v.payment_method,
        receipt_available: Boolean(v.receipt_available),
        missing_receipt_reason: v.missing_receipt_reason ?? '',
        declaration_accepted: Boolean(v.declaration_accepted),
      }
    } else {
      form.value.department_id = auth.user!.department_id
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load form'
  } finally {
    loaded.value = true
  }
})

function payload(submit: boolean) {
  return {
    employee_id: form.value.employee_id,
    department_id: form.value.department_id || null,
    expense_date: form.value.expense_date,
    category_id: form.value.category_id || null,
    description: form.value.description,
    vendor: form.value.vendor || null,
    amount: Number(form.value.amount),
    currency: form.value.currency,
    payment_method: form.value.payment_method,
    receipt_available: form.value.receipt_available,
    missing_receipt_reason: form.value.missing_receipt_reason || null,
    declaration_accepted: form.value.declaration_accepted,
    submit,
  }
}

async function save(submit: boolean) {
  error.value = ''
  showIssues.value = submit
  // Drafts may be incomplete; a submission may not.
  if (submit && issues.value.length > 0) {
    error.value = 'Fix the highlighted fields before submitting.'
    return
  }
  busy.value = true
  try {
    const saved = editingId.value
      ? await api<ExpenseVoucherDetail>(`/api/expenses/${editingId.value}`, {
          method: 'PATCH',
          json: payload(submit),
        })
      : await api<ExpenseVoucherDetail>('/api/expenses', {
          method: 'POST',
          json: payload(submit),
        })
    router.push({ name: 'expense-detail', params: { id: saved.id } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save voucher'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">
        {{ editingId ? 'Edit expense voucher' : 'New expense voucher' }}
      </h2>
      <RouterLink :to="{ name: 'expenses' }" class="btn btn-sm">Back to list</RouterLink>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <form v-if="loaded" class="panel" @submit.prevent="save(true)">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div v-if="auth.isAdmin" class="col-span-2">
          <label class="field-label" for="v-emp">Employee</label>
          <select id="v-emp" v-model="form.employee_id" class="field-input">
            <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>
        </div>

        <div class="col-span-2">
          <label class="field-label" for="v-dept">Department</label>
          <select
            id="v-dept"
            v-model="form.department_id"
            class="field-input"
            :disabled="!auth.isAdmin"
          >
            <option :value="null">—</option>
            <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
          <p v-if="!auth.isAdmin" class="mt-1 text-xs text-muted">
            Taken from your employee profile.
          </p>
        </div>

        <div>
          <label class="field-label" for="v-date">Date of expense</label>
          <input
            id="v-date"
            v-model="form.expense_date"
            type="date"
            :max="auth.user!.today"
            required
            class="field-input mono"
          />
          <p v-if="issueFor('expense_date')" class="mt-1 text-xs text-red">
            {{ issueFor('expense_date') }}
          </p>
        </div>

        <div>
          <label class="field-label" for="v-cat">Category</label>
          <select id="v-cat" v-model="form.category_id" class="field-input">
            <option :value="null">—</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div>
          <label class="field-label" for="v-amount">Amount</label>
          <input
            id="v-amount"
            v-model="form.amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            class="field-input mono"
          />
          <p v-if="issueFor('amount')" class="mt-1 text-xs text-red">
            {{ issueFor('amount') }}
          </p>
        </div>

        <div>
          <label class="field-label" for="v-currency">Currency</label>
          <input
            id="v-currency"
            v-model="form.currency"
            maxlength="4"
            required
            class="field-input mono"
          />
        </div>

        <div class="col-span-2">
          <label class="field-label" for="v-method">Payment method</label>
          <select id="v-method" v-model="form.payment_method" class="field-input">
            <option v-for="m in PAYMENT_METHODS" :key="m" :value="m">
              {{ PAYMENT_METHOD_LABELS[m] }}
            </option>
          </select>
        </div>

        <div class="col-span-2">
          <label class="field-label" for="v-vendor">Vendor / supplier (optional)</label>
          <input
            id="v-vendor"
            v-model="form.vendor"
            maxlength="160"
            class="field-input"
            placeholder="e.g. Kwame's Hardware"
          />
        </div>

        <div class="col-span-2 md:col-span-4">
          <label class="field-label" for="v-desc">Purpose / description</label>
          <textarea
            id="v-desc"
            v-model="form.description"
            required
            rows="3"
            maxlength="1000"
            class="field-input"
            placeholder="What the expense was for, and why it was necessary"
          />
          <p v-if="issueFor('description')" class="mt-1 text-xs text-red">
            {{ issueFor('description') }}
          </p>
        </div>
      </div>

      <!-- ==================================================== receipt block -->
      <fieldset class="mt-5 border-t border-line pt-4">
        <legend class="field-label">Receipt</legend>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.receipt_available" type="checkbox" />
          A receipt is available for this expense
        </label>
        <p class="mt-1 text-xs text-muted">
          {{
            editingId
              ? 'Attach the receipt file on the voucher page after saving.'
              : 'Save the voucher first, then attach the receipt file on its page.'
          }}
        </p>

        <!-- Shown only when no receipt exists, per the declaration rules. -->
        <div v-if="!form.receipt_available" class="mt-4 rounded-lg border border-amber bg-amber-soft p-4">
          <div>
            <label class="field-label" for="v-reason">Reason for missing receipt</label>
            <textarea
              id="v-reason"
              v-model="form.missing_receipt_reason"
              rows="2"
              maxlength="500"
              class="field-input"
              placeholder="e.g. Trotro fare — no receipts issued"
            />
            <p v-if="issueFor('missing_receipt_reason')" class="mt-1 text-xs text-red">
              {{ issueFor('missing_receipt_reason') }}
            </p>
          </div>

          <div class="mt-4">
            <p class="field-label">Employee declaration</p>
            <p class="mb-2 rounded border border-line bg-panel p-3 text-sm italic">
              {{ DEFAULT_DECLARATION }}
            </p>
            <label class="flex items-start gap-2 text-sm">
              <input v-model="form.declaration_accepted" type="checkbox" class="mt-1" />
              <span>I have read and accept this declaration.</span>
            </label>
            <p v-if="issueFor('declaration_accepted')" class="mt-1 text-xs text-red">
              {{ issueFor('declaration_accepted') }}
            </p>
          </div>
        </div>
      </fieldset>

      <div class="mt-5 flex flex-wrap gap-2">
        <button class="btn btn-solid" :disabled="busy">
          {{ busy ? 'Saving…' : 'Submit for approval' }}
        </button>
        <button type="button" class="btn" :disabled="busy" @click="save(false)">
          Save as draft
        </button>
        <RouterLink :to="{ name: 'expenses' }" class="btn">Cancel</RouterLink>
      </div>
    </form>
  </div>
</template>
