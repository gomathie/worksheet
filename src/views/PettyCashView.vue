<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import {
  PETTY_CASH_METHODS,
  PETTY_CASH_METHOD_LABELS,
  STATUS_LABELS,
  consumesPettyCash,
} from '../../shared/expenses'
import { useAuthStore } from '../stores/auth'
import type { Employee, PettyCashPayload, PettyCashRequest } from '../types'

// Petty cash: what the signed-in employee is holding, and — for anyone with
// oversight — everyone else's float. The balance is derived from the ledger
// minus the vouchers charged to it, so it always agrees with the vouchers.

const auth = useAuthStore()
const myId = computed(() => auth.user?.id ?? '')

const data = ref<PettyCashPayload | null>(null)
const employees = ref<Employee[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
// Both movement forms below start collapsed behind a button rather than
// sitting open by default — same reasoning as the Employees "Add" form.
const showRequestForm = ref(false)
const showRecordForm = ref(false)

const form = ref({
  employee_id: '',
  type: 'issue' as 'issue' | 'return' | 'adjustment',
  amount: '' as string | number,
  note: '',
  method: 'cash' as 'cash' | 'mobile_money',
  reference: '',
})

// Holder asking for more cash.
const requestForm = ref({ amount: '' as string | number, reason: '' })

// Admin confirming what was actually handed over, keyed by request id.
const confirmForm = ref<
  Record<string, { amount: string | number; method: string; reference: string; note: string }>
>({})

const pending = computed(() =>
  (data.value?.requests ?? []).filter((r) => r.status === 'pending'),
)
const myRequests = computed(() =>
  (data.value?.requests ?? []).filter((r) => r.employee_id === myId.value),
)
const myOpenRequest = computed(() =>
  myRequests.value.find((r) => r.status === 'pending'),
)

async function load() {
  error.value = ''
  try {
    data.value = await api<PettyCashPayload>('/api/petty-cash')
    if (data.value.can_issue && employees.value.length === 0) {
      employees.value = (await api<Employee[]>('/api/employees')).filter(
        (e) => e.active && e.rights.use_petty_cash,
      )
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load petty cash'
  }
}
onMounted(load)

const currency = computed(() => data.value?.currency ?? '')
const money = (n: number) => `${currency.value}${n.toFixed(2)}`

/** How much of the float is committed, for the bar under the figures.
 *  Clamped to 0–100 so an overdrawn float shows a full bar rather than
 *  overflowing its track. */
const spentPct = computed(() => {
  const d = data.value
  if (!d || d.issued <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((d.spent_total / d.issued) * 100)))
})

/** Same figure per holder, for the oversight table. */
const usedPct = (h: { issued: number; spent: number }) =>
  h.issued > 0 ? Math.min(100, Math.max(0, Math.round((h.spent / h.issued) * 100))) : 0

/** Organisation-wide position: what is out there, spent, and still held.
 *  Summed client-side from the rows already on screen, so the total can
 *  never disagree with the list it sits under. */
const holderTotals = computed(() =>
  (data.value?.holders ?? []).reduce(
    (t, h) => ({
      issued: Math.round((t.issued + h.issued) * 100) / 100,
      spent: Math.round((t.spent + h.spent) * 100) / 100,
      balance: Math.round((t.balance + h.balance) * 100) / 100,
    }),
    { issued: 0, spent: 0, balance: 0 },
  ),
)

async function record() {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    const res = await api<{ balance: number }>('/api/petty-cash', {
      method: 'POST',
      json: {
        employee_id: form.value.employee_id,
        type: form.value.type,
        amount: Number(form.value.amount),
        note: form.value.note || undefined,
        method: form.value.type === 'adjustment' ? undefined : form.value.method,
        reference: form.value.reference || undefined,
      },
    })
    const who = employees.value.find((e) => e.id === form.value.employee_id)?.name ?? 'Employee'
    notice.value = `${who} is now holding ${money(res.balance)}.`
    form.value = {
      employee_id: '',
      type: 'issue',
      amount: '',
      note: '',
      method: 'cash',
      reference: '',
    }
    showRecordForm.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to record the movement'
  } finally {
    busy.value = false
  }
}

async function submitRequest() {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await api('/api/petty-cash/requests', {
      method: 'POST',
      json: {
        amount: Number(requestForm.value.amount),
        reason: requestForm.value.reason || undefined,
      },
    })
    requestForm.value = { amount: '', reason: '' }
    showRequestForm.value = false
    notice.value = 'Request sent — an administrator will confirm what they hand over.'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send the request'
  } finally {
    busy.value = false
  }
}

function confirmState(r: PettyCashRequest) {
  if (!confirmForm.value[r.id]) {
    // Default to exactly what was asked for; the admin can lower it.
    confirmForm.value[r.id] = {
      amount: r.amount,
      method: 'cash',
      reference: '',
      note: '',
    }
  }
  return confirmForm.value[r.id]
}

async function decideRequest(r: PettyCashRequest, decision: 'approved' | 'rejected') {
  const f = confirmState(r)
  if (decision === 'rejected' && !f.note.trim()) {
    error.value = 'A note is required when turning down a request.'
    return
  }
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await api(`/api/petty-cash/requests/${r.id}/decision`, {
      method: 'POST',
      json: {
        decision,
        amount: decision === 'approved' ? Number(f.amount) : undefined,
        method: decision === 'approved' ? f.method : undefined,
        reference: f.reference || undefined,
        note: f.note || undefined,
      },
    })
    delete confirmForm.value[r.id]
    notice.value =
      decision === 'approved'
        ? `Confirmed ${money(Number(f.amount))} to ${r.employee_name}.`
        : `Request from ${r.employee_name} declined.`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to record the decision'
  } finally {
    busy.value = false
  }
}

const methodLabel = (m: string | null) =>
  m ? PETTY_CASH_METHOD_LABELS[m as keyof typeof PETTY_CASH_METHOD_LABELS] : '—'

const movementLabel = (t: string) =>
  t === 'issue' ? 'Issued' : t === 'return' ? 'Returned' : 'Adjustment'

/** Issues add to the float, returns take away; adjustments are signed. */
const signed = (e: { type: string; amount: number }) =>
  e.type === 'return' ? -e.amount : e.amount
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Petty cash</h2>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>
    <p v-if="notice" class="panel mb-6 border-teal bg-teal-soft text-teal">{{ notice }}</p>

    <template v-if="data">
      <!-- ------------------------------------------------------ own float -->
      <div v-if="data.can_use || data.balance !== 0" class="panel mb-6">
        <!-- The remainder alone doesn't let anyone account for a float —
             "holding 40" reads very differently against 50 issued than
             against 500. All three figures, as one sum you can check. -->
        <div class="grid grid-cols-3 gap-4">
          <div>
            <p class="field-label">Issued to you</p>
            <p class="stat-figure">{{ money(data.issued) }}</p>
          </div>
          <div>
            <p class="field-label">Spent</p>
            <p class="stat-figure">{{ money(data.spent_total) }}</p>
          </div>
          <div>
            <p class="field-label">Remaining</p>
            <p class="stat-figure" :class="data.balance < 0 ? 'text-red' : 'text-teal'">
              {{ money(data.balance) }}
            </p>
          </div>
        </div>
        <div
          v-if="data.issued > 0"
          class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-cream"
          :title="`${spentPct}% of the float spent`"
        >
          <div
            class="h-full rounded-full transition-all"
            :class="data.balance < 0 ? 'bg-red' : 'bg-teal'"
            :style="{ width: `${spentPct}%` }"
          />
        </div>
        <p class="mt-3 text-sm text-muted">
          Issued to you, less every voucher you charged to petty cash. A voucher
          that is rejected or returned to draft puts its amount back.
        </p>
        <p v-if="data.balance < 0" class="mt-2 text-sm text-red">
          This float is overdrawn — ask an administrator to record the missing
          top-up or an adjustment.
        </p>
      </div>

      <p v-else-if="!data.can_issue" class="panel mb-6 text-muted">
        You do not hold a petty cash float. An administrator can assign one.
      </p>

      <!-- --------------------------------------------- ask for a top-up -->
      <div v-if="data.can_use" class="panel mb-6">
        <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h3 class="display text-xl">Request a top-up</h3>
          <button
            v-if="!myOpenRequest && !showRequestForm"
            class="btn btn-sm btn-solid"
            @click="showRequestForm = true"
          >
            Request a top-up
          </button>
        </div>
        <p v-if="myOpenRequest" class="text-sm text-muted">
          You asked for
          <span class="mono font-semibold">{{ money(myOpenRequest.amount) }}</span>
          on <span class="mono">{{ myOpenRequest.created_at.slice(0, 10) }}</span
          >. An administrator will confirm what they hand over — you will be
          notified. Only one request can be open at a time.
        </p>
        <p v-else-if="!showRequestForm" class="text-sm text-muted">
          Ask an administrator for more cash. Nothing moves until they confirm
          what was actually given, and how.
        </p>
        <template v-else>
          <p class="mb-4 text-sm text-muted">
            Ask an administrator for more cash. Nothing moves until they confirm
            what was actually given, and how.
          </p>
          <form class="grid grid-cols-1 gap-4 md:grid-cols-4" @submit.prevent="submitRequest">
            <div>
              <label class="field-label" for="pc-req-amount">Amount needed</label>
              <input
                id="pc-req-amount"
                v-model="requestForm.amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                class="field-input mono"
              />
            </div>
            <div class="md:col-span-2">
              <label class="field-label" for="pc-req-reason">What it is for</label>
              <input
                id="pc-req-reason"
                v-model="requestForm.reason"
                maxlength="300"
                class="field-input"
                placeholder="e.g. Site visits for the rest of the month"
              />
            </div>
            <div class="flex items-end gap-2">
              <button class="btn btn-solid" :disabled="busy">Send request</button>
              <button type="button" class="btn" @click="showRequestForm = false">
                Cancel
              </button>
            </div>
          </form>
        </template>
      </div>

      <!-- ------------------------------------- admin: confirm what was given -->
      <div v-if="data.can_issue && pending.length" class="panel mb-6 border-amber">
        <h3 class="display mb-1 text-xl text-amber">
          Top-up requests ({{ pending.length }})
        </h3>
        <p class="mb-4 text-sm text-muted">
          Confirm what you actually handed over — it may differ from what was
          asked for. Only the confirmed amount reaches the float.
        </p>

        <div
          v-for="r in pending"
          :key="r.id"
          class="mb-4 rounded-lg border border-line p-3 last:mb-0"
        >
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-medium">
              {{ r.employee_name }} asked for
              <span class="mono font-semibold">{{ money(r.amount) }}</span>
            </p>
            <span class="mono text-xs text-muted">{{ r.created_at.slice(0, 10) }}</span>
          </div>
          <p v-if="r.reason" class="mb-3 text-sm text-muted">{{ r.reason }}</p>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label class="field-label" :for="`c-amt-${r.id}`">Amount given</label>
              <input
                :id="`c-amt-${r.id}`"
                v-model="confirmState(r).amount"
                type="number"
                min="0.01"
                step="0.01"
                class="field-input mono"
              />
            </div>
            <div>
              <label class="field-label" :for="`c-met-${r.id}`">Given by</label>
              <select
                :id="`c-met-${r.id}`"
                v-model="confirmState(r).method"
                class="field-input"
              >
                <option v-for="m in PETTY_CASH_METHODS" :key="m" :value="m">
                  {{ PETTY_CASH_METHOD_LABELS[m] }}
                </option>
              </select>
            </div>
            <div>
              <label class="field-label" :for="`c-ref-${r.id}`">Reference</label>
              <input
                :id="`c-ref-${r.id}`"
                v-model="confirmState(r).reference"
                maxlength="120"
                class="field-input mono"
                placeholder="MoMo txn id"
              />
            </div>
            <div>
              <label class="field-label" :for="`c-note-${r.id}`">Note</label>
              <input
                :id="`c-note-${r.id}`"
                v-model="confirmState(r).note"
                maxlength="300"
                class="field-input"
                placeholder="Required to decline"
              />
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class="btn btn-sm btn-solid"
              :disabled="busy"
              @click="decideRequest(r, 'approved')"
            >
              Confirm given
            </button>
            <button
              class="btn btn-sm btn-danger"
              :disabled="busy"
              @click="decideRequest(r, 'rejected')"
            >
              Decline
            </button>
          </div>
        </div>
      </div>

      <!-- ------------------------------------------------- issue / return -->
      <div v-if="data.can_issue" class="panel mb-6">
        <div class="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h3 class="display text-xl">Assign or recover cash</h3>
          <button
            v-if="!showRecordForm"
            class="btn btn-sm btn-solid"
            @click="showRecordForm = true"
          >
            Record a movement
          </button>
        </div>
        <p class="mb-4 text-sm text-muted">
          Only employees granted the petty cash right appear here — set it in the
          Employees tab first.
        </p>
        <form
          v-if="showRecordForm"
          class="grid grid-cols-1 gap-4 md:grid-cols-4"
          @submit.prevent="record"
        >
          <div class="md:col-span-2">
            <label class="field-label" for="pc-emp">Employee</label>
            <select id="pc-emp" v-model="form.employee_id" required class="field-input">
              <option value="" disabled>Select…</option>
              <option v-for="e in employees" :key="e.id" :value="e.id">
                {{ e.name }}<template v-if="e.employee_code">
                  ({{ e.employee_code }})</template
                >
              </option>
            </select>
            <p v-if="employees.length === 0" class="mt-1 text-xs text-amber">
              Nobody holds the petty cash right yet.
            </p>
          </div>
          <div>
            <label class="field-label" for="pc-type">Movement</label>
            <select id="pc-type" v-model="form.type" class="field-input">
              <option value="issue">Issue cash</option>
              <option value="return">Cash returned</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="pc-amount">Amount</label>
            <input
              id="pc-amount"
              v-model="form.amount"
              type="number"
              step="0.01"
              required
              class="field-input mono"
            />
            <p v-if="form.type === 'adjustment'" class="mt-1 text-xs text-muted">
              Negative reduces the float.
            </p>
          </div>
          <div v-if="form.type !== 'adjustment'">
            <label class="field-label" for="pc-method">Given by</label>
            <select id="pc-method" v-model="form.method" class="field-input">
              <option v-for="m in PETTY_CASH_METHODS" :key="m" :value="m">
                {{ PETTY_CASH_METHOD_LABELS[m] }}
              </option>
            </select>
          </div>
          <div v-if="form.type !== 'adjustment'">
            <label class="field-label" for="pc-ref">Reference (optional)</label>
            <input
              id="pc-ref"
              v-model="form.reference"
              maxlength="120"
              class="field-input mono"
              placeholder="MoMo txn id"
            />
          </div>
          <div class="md:col-span-2">
            <label class="field-label" for="pc-note">
              Note{{ form.type === 'adjustment' ? '' : ' (optional)' }}
            </label>
            <input
              id="pc-note"
              v-model="form.note"
              maxlength="200"
              class="field-input"
              placeholder="e.g. Monthly float for site visits"
            />
          </div>
          <div class="flex items-end gap-2">
            <button class="btn btn-solid" :disabled="busy || employees.length === 0">
              {{ busy ? 'Saving…' : 'Record' }}
            </button>
            <button type="button" class="btn" @click="showRecordForm = false">Cancel</button>
          </div>
        </form>
      </div>

      <!-- ----------------------------------------------------- all floats -->
      <div v-if="data.holders.length" class="panel mb-6">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="display text-xl">Floats held</h3>
          <p class="text-sm text-muted">
            <span class="mono text-teal">{{ money(holderTotals.balance) }}</span>
            outstanding across {{ data.holders.length }}
            {{ data.holders.length === 1 ? 'holder' : 'holders' }}
          </p>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Issued (net)</th>
                <th class="num">Used</th>
                <th class="num">Remaining</th>
                <th>Last movement</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in data.holders" :key="h.employee_id">
                <td>
                  {{ h.employee_name }}
                  <span v-if="h.employee_code" class="mono text-xs text-muted">
                    {{ h.employee_code }}
                  </span>
                </td>
                <td class="num">{{ money(h.issued) }}</td>
                <td class="num">
                  {{ money(h.spent) }}
                  <span v-if="h.issued > 0" class="ml-1 text-xs text-muted">
                    {{ usedPct(h) }}%
                  </span>
                </td>
                <td class="num font-semibold" :class="h.balance < 0 ? 'text-red' : ''">
                  {{ money(h.balance) }}
                </td>
                <td class="mono text-xs text-muted">
                  {{ h.last_issued_at?.slice(0, 10) ?? '—' }}
                </td>
              </tr>
              <!-- What the organisation has out there in total — the figure
                   that has to be reconciled against physical cash. -->
              <tr class="totals">
                <td>Total</td>
                <td class="num">{{ money(holderTotals.issued) }}</td>
                <td class="num">{{ money(holderTotals.spent) }}</td>
                <td class="num" :class="holderTotals.balance < 0 ? 'text-red' : ''">
                  {{ money(holderTotals.balance) }}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- --------------------------------------------------- own movements -->
      <div v-if="data.ledger.length" class="panel mb-6">
        <h3 class="display mb-3 text-xl">Your cash movements</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Movement</th>
                <th class="num">Amount</th>
                <th>Given by</th>
                <th>Note</th>
                <th>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in data.ledger" :key="e.id">
                <td class="mono whitespace-nowrap text-[13px]">
                  {{ e.created_at.slice(0, 10) }}
                </td>
                <td>{{ movementLabel(e.type) }}</td>
                <td class="num" :class="signed(e) < 0 ? 'text-red' : 'text-teal'">
                  {{ signed(e) > 0 ? '+' : '' }}{{ money(signed(e)) }}
                </td>
                <td class="text-xs">
                  {{ methodLabel(e.method)
                  }}<span v-if="e.reference" class="mono block text-muted">{{
                    e.reference
                  }}</span>
                </td>
                <td class="text-muted">{{ e.note ?? '—' }}</td>
                <td class="text-xs">{{ e.created_by_name ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ------------------------------------------------ vouchers charged -->
      <div v-if="data.spent.length" class="panel">
        <h3 class="display mb-1 text-xl">Vouchers charged to your float</h3>
        <p class="mb-3 text-sm text-muted">
          Greyed rows are drafts or rejected claims — those do not reduce your
          balance.
        </p>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th class="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="v in data.spent"
                :key="v.id"
                :class="{ 'opacity-45': !consumesPettyCash(v.status) }"
              >
                <td class="mono whitespace-nowrap text-[13px]">
                  <RouterLink
                    :to="{ name: 'expense-detail', params: { id: v.id } }"
                    class="underline"
                    >{{ v.voucher_number }}</RouterLink
                  >
                </td>
                <td class="mono whitespace-nowrap">{{ v.expense_date }}</td>
                <td class="num">{{ money(v.amount) }}</td>
                <td class="text-xs">{{ STATUS_LABELS[v.status] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
