<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import type { Adjustment, Employee, MyRemuneration, ReportPayload } from '../types'

const auth = useAuthStore()
const month = ref(auth.user!.today.slice(0, 7))
const error = ref('')
const busy = ref(false)

// Everyone: own pay summary. Admin: team report + all adjustments too.
const mine = ref<MyRemuneration | null>(null)
const report = ref<ReportPayload | null>(null)
const adjustments = ref<Adjustment[]>([])
const employees = ref<Employee[]>([])

const bonusForm = ref({ employee_id: '', amount: '', description: '' })
const reimbForm = ref({ amount: '', description: '' })

const settingsCurrency = ref('')
const currency = computed(() => mine.value?.currency ?? settingsCurrency.value)
const money = (n: number) => `${currency.value}${n.toFixed(2)}`

async function load() {
  error.value = ''
  try {
    // Currency is safe for everyone; pay figures require the payslip right.
    settingsCurrency.value = (
      await api<{ currency: string }>('/api/settings')
    ).currency
    mine.value = auth.rights.view_remuneration
      ? await api<MyRemuneration>(`/api/me/remuneration?month=${month.value}`)
      : null
    if (auth.isAdmin) {
      ;[report.value, adjustments.value] = await Promise.all([
        api<ReportPayload>(`/api/reports/monthly?month=${month.value}`),
        api<Adjustment[]>(`/api/adjustments?month=${month.value}`),
      ])
      if (employees.value.length === 0) {
        employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
      }
    } else {
      adjustments.value = await api<Adjustment[]>(`/api/adjustments?month=${month.value}`)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  }
}
onMounted(load)
watch(month, load)

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  busy.value = true
  try {
    await fn()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

// -------- employee actions

function requestReimbursement() {
  return run(async () => {
    await api('/api/adjustments', {
      method: 'POST',
      json: {
        type: 'reimbursement',
        month: month.value,
        amount: Number(reimbForm.value.amount),
        description: reimbForm.value.description,
      },
    })
    reimbForm.value = { amount: '', description: '' }
  })
}

function withdrawRequest(a: Adjustment) {
  return run(() => api(`/api/adjustments/${a.id}`, { method: 'DELETE' }))
}

function confirmReceipt() {
  return run(() =>
    api('/api/payments/confirm', { method: 'POST', json: { month: month.value } }),
  )
}

// -------- admin actions

function addBonus() {
  return run(async () => {
    await api('/api/adjustments', {
      method: 'POST',
      json: {
        type: 'bonus',
        employee_id: bonusForm.value.employee_id,
        month: month.value,
        amount: Number(bonusForm.value.amount),
        description: bonusForm.value.description,
      },
    })
    bonusForm.value = { employee_id: '', amount: '', description: '' }
  })
}

function decide(a: Adjustment, status: 'approved' | 'rejected') {
  return run(() => api(`/api/adjustments/${a.id}`, { method: 'PATCH', json: { status } }))
}

function removeAdjustment(a: Adjustment) {
  if (!confirm(`Remove this ${a.type} of ${money(a.amount)}?`)) return
  return run(() => api(`/api/adjustments/${a.id}`, { method: 'DELETE' }))
}

function setPaid(employeeId: string, paid: boolean) {
  return run(() =>
    api('/api/payments/paid', {
      method: 'POST',
      json: { employee_id: employeeId, month: month.value, paid },
    }),
  )
}

// Claims an approver may decide: screened and put in front of them. An
// unscreened 'pending' claim belongs to the screening desk, not here.
const pendingRequests = computed(() =>
  adjustments.value.filter(
    (a) => a.type === 'reimbursement' && a.status === 'awaiting_approval',
  ),
)

// The signed-in employee's own reimbursement requests (any status) — shown in
// the request panel so staff without the payslip right can still track them.
const myReimbursements = computed(() =>
  adjustments.value.filter((a) => a.type === 'reimbursement'),
)

const ADJUSTMENT_STATUS_LABELS: Record<Adjustment['status'], string> = {
  pending: 'Awaiting screening',
  awaiting_approval: 'With the approver',
  approved: 'Approved',
  rejected: 'Rejected',
}
const statusLabel = (a: Adjustment) => ADJUSTMENT_STATUS_LABELS[a.status] ?? a.status
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Payments</h2>
      <MonthPicker v-model="month" />
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <!-- ======================== own pay summary (requires remuneration right) -->
    <div v-if="auth.rights.view_remuneration && mine" class="panel mb-6">
      <h3 class="display mb-3 text-xl">Your remuneration</h3>
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p class="field-label">Base</p>
          <p class="mono text-2xl font-semibold">{{ money(mine.base) }}</p>
        </div>
        <div>
          <p class="field-label">Bonuses</p>
          <p class="mono text-2xl font-semibold">{{ money(mine.bonus) }}</p>
        </div>
        <div>
          <p class="field-label">Reimbursements</p>
          <p class="mono text-2xl font-semibold">{{ money(mine.reimbursements) }}</p>
        </div>
        <div>
          <p class="field-label">Total due</p>
          <p class="mono text-2xl font-semibold text-teal">{{ money(mine.total_due) }}</p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <span
          class="display rounded-full border px-3 py-1 text-xs tracking-wider"
          :class="mine.paid_at ? 'border-teal text-teal' : 'border-line text-muted'"
        >
          {{ mine.paid_at ? 'Marked paid' : 'Not yet paid' }}
        </span>
        <span
          class="display rounded-full border px-3 py-1 text-xs tracking-wider"
          :class="mine.confirmed_at ? 'border-teal text-teal' : 'border-line text-muted'"
        >
          {{ mine.confirmed_at ? 'Receipt confirmed by you' : 'Receipt not confirmed' }}
        </span>
        <button
          v-if="!mine.confirmed_at"
          class="btn btn-sm btn-solid"
          :disabled="busy"
          @click="confirmReceipt"
        >
          Confirm I received this payment
        </button>
      </div>

      <!-- own adjustments with descriptions -->
      <div v-if="mine.adjustments.length" class="mt-4">
        <p class="field-label mb-2">Details</p>
        <ul class="space-y-1 text-sm">
          <li
            v-for="a in mine.adjustments"
            :key="a.id"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="display rounded-full border border-line px-2 py-0.5 text-xs tracking-wider">
              {{ a.type === 'bonus' ? 'Bonus' : 'Reimbursement' }}
            </span>
            <span class="mono">{{ money(a.amount) }}</span>
            <span class="text-muted">{{ a.description }}</span>
            <span
              class="text-xs"
              :class="a.status === 'approved' ? 'text-teal' : a.status === 'rejected' ? 'text-red' : 'text-muted'"
            >
              {{ statusLabel(a) }}
            </span>
            <button
              v-if="!auth.isAdmin && a.type === 'reimbursement' && a.status === 'pending'"
              class="btn btn-sm"
              :disabled="busy"
              @click="withdrawRequest(a)"
            >
              Withdraw
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- ======================== reimbursement request (non-admin) -->
    <div v-if="!auth.isAdmin" class="panel mb-6">
      <h3 class="display mb-3 text-xl">Request a reimbursement</h3>
      <p class="mb-4 text-sm text-muted">
        Once an admin approves it, the amount is added to your total due for
        {{ month }}.
      </p>
      <form class="grid grid-cols-1 gap-4 md:grid-cols-4" @submit.prevent="requestReimbursement">
        <div>
          <label class="field-label" for="r-amount">Amount</label>
          <input
            id="r-amount"
            v-model="reimbForm.amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            class="field-input mono"
          />
        </div>
        <div class="md:col-span-2">
          <label class="field-label" for="r-desc">What is it for?</label>
          <input
            id="r-desc"
            v-model="reimbForm.description"
            required
            maxlength="200"
            class="field-input"
            placeholder="e.g. Transport for site visit"
          />
        </div>
        <div class="flex items-end">
          <button class="btn btn-solid" :disabled="busy">Submit request</button>
        </div>
      </form>

      <!-- Own reimbursement requests — shown here for staff who can't see the
           full pay panel above (no remuneration right). -->
      <div v-if="!auth.rights.view_remuneration && myReimbursements.length" class="mt-5">
        <p class="field-label mb-2">Your requests this month</p>
        <ul class="space-y-1 text-sm">
          <li
            v-for="a in myReimbursements"
            :key="a.id"
            class="flex flex-wrap items-center gap-2"
          >
            <span class="mono">{{ money(a.amount) }}</span>
            <span class="text-muted">{{ a.description }}</span>
            <span
              class="text-xs"
              :class="a.status === 'approved' ? 'text-teal' : a.status === 'rejected' ? 'text-red' : 'text-muted'"
            >
              {{ statusLabel(a) }}
            </span>
            <button
              v-if="a.status === 'pending' || a.status === 'awaiting_approval'"
              class="btn btn-sm"
              :disabled="busy"
              @click="withdrawRequest(a)"
            >
              Withdraw
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- ======================== admin: bonuses, approvals, paid status -->
    <template v-if="auth.isAdmin">
      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Add a bonus</h3>
        <form class="grid grid-cols-1 gap-4 md:grid-cols-4" @submit.prevent="addBonus">
          <div>
            <label class="field-label" for="b-emp">Employee</label>
            <select id="b-emp" v-model="bonusForm.employee_id" required class="field-input">
              <option value="" disabled>Select…</option>
              <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="b-amount">Amount</label>
            <input
              id="b-amount"
              v-model="bonusForm.amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              class="field-input mono"
            />
          </div>
          <div>
            <label class="field-label" for="b-desc">Short description</label>
            <input
              id="b-desc"
              v-model="bonusForm.description"
              required
              maxlength="200"
              class="field-input"
              placeholder="e.g. Outstanding QAP work"
            />
          </div>
          <div class="flex items-end">
            <button class="btn btn-solid" :disabled="busy">Add bonus</button>
          </div>
        </form>
      </div>

      <div v-if="pendingRequests.length" class="panel mb-6">
        <h3 class="display mb-3 text-xl">
          Reimbursement requests
          <span class="mono text-base text-muted">({{ pendingRequests.length }} pending)</span>
        </h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Amount</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in pendingRequests" :key="a.id">
                <td>{{ a.employee_name }}</td>
                <td class="num">{{ money(a.amount) }}</td>
                <td class="text-muted">{{ a.description }}</td>
                <td class="whitespace-nowrap">
                  <button class="btn btn-sm mr-1" :disabled="busy" @click="decide(a, 'approved')">
                    Approve
                  </button>
                  <button class="btn btn-sm btn-danger" :disabled="busy" @click="decide(a, 'rejected')">
                    Reject
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="report" class="panel mb-6">
        <h3 class="display mb-3 text-xl">Payouts for {{ month }}</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Base</th>
                <th class="num">Bonus</th>
                <th class="num">Reimb.</th>
                <th class="num">Total due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in report.per_person" :key="p.employee_id">
                <td>{{ p.name }}</td>
                <td class="num">{{ money(p.remuneration ?? 0) }}</td>
                <td class="num">{{ money(p.bonus ?? 0) }}</td>
                <td class="num">{{ money(p.reimbursements ?? 0) }}</td>
                <td class="num font-semibold">{{ money(p.total_due ?? 0) }}</td>
                <td class="whitespace-nowrap text-xs">
                  <span :class="p.paid ? 'text-teal' : 'text-muted'">
                    {{ p.paid ? 'Paid' : 'Unpaid' }}
                  </span>
                  <span v-if="p.confirmed" class="text-teal"> · Confirmed</span>
                </td>
                <td class="whitespace-nowrap">
                  <button
                    class="btn btn-sm"
                    :class="p.paid ? '' : 'btn-solid'"
                    :disabled="busy"
                    @click="setPaid(p.employee_id, !p.paid)"
                  >
                    {{ p.paid ? 'Mark unpaid' : 'Mark paid' }}
                  </button>
                </td>
              </tr>
              <tr v-if="report.per_person.length === 0">
                <td colspan="7" class="py-6 text-center text-muted">
                  No activity this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="adjustments.length" class="panel">
        <h3 class="display mb-3 text-xl">All bonuses &amp; reimbursements</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th class="num">Amount</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in adjustments" :key="a.id">
                <td>{{ a.employee_name }}</td>
                <td>{{ a.type === 'bonus' ? 'Bonus' : 'Reimbursement' }}</td>
                <td class="num">{{ money(a.amount) }}</td>
                <td class="text-muted">{{ a.description }}</td>
                <td
                  class="text-xs"
                  :class="a.status === 'approved' ? 'text-teal' : a.status === 'rejected' ? 'text-red' : 'text-muted'"
                >
                  {{ statusLabel(a) }}
                </td>
                <td>
                  <button class="btn btn-sm btn-danger" :disabled="busy" @click="removeAdjustment(a)">
                    Remove
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
