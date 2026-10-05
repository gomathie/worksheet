<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '../api'
import type { PointDeduction } from '../types'

// Only what the modal actually renders/sends — a full Employee (its rights,
// work types, rate overrides...) satisfies this too, so EmployeesView.vue's
// existing usage is unaffected, but a lighter caller (e.g. a task's assignee,
// which is only ever an {id, name} TaskAssignee) doesn't need to fetch one.
interface DeductionTarget {
  id: string
  name: string
  employee_code?: string | null
}

const props = defineProps<{
  employee: DeductionTarget | null
  open: boolean
  /** Pre-fills "Related Task ID" and switches the header to "Log Violation"
   * wording — set when opened from a task's own page rather than Employees. */
  taskId?: string
  /** Pre-fills the points field, e.g. with the admin-configured
   * task_violation_points default. Still freely editable per instance. */
  defaultAmount?: number
  /** Shown under the employee name when opened with task context, e.g. a
   * task code + title, so it's clear which task this is about. */
  contextLabel?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', deduction: PointDeduction): void
}>()

// State
const month = ref(new Date().toISOString().slice(0, 7))
const balanceLoading = ref(false)
const earnedPoints = ref(0)
const deductedPoints = ref(0)
const currentBalance = ref(0)
const fetchError = ref('')

const decision = ref<'deducted' | 'let_it_go'>('deducted')
const amount = ref<number | ''>('')
const reason = ref('')
const taskId = ref('')
const warningRef = ref('')
const confirmed = ref(false)

const busy = ref(false)
const submitError = ref('')

// Load balance when modal opens or month changes
async function loadBalance() {
  if (!props.employee || !props.open) return
  balanceLoading.value = true
  fetchError.value = ''
  try {
    const data = await api<{
      earned: number
      deducted: number
      balance: number
    }>(`/api/point-deductions/balance/${props.employee.id}?month=${month.value}`)
    earnedPoints.value = data.earned
    deductedPoints.value = data.deducted
    currentBalance.value = data.balance
  } catch (err: unknown) {
    fetchError.value = err instanceof Error ? err.message : 'Failed to load balance'
  } finally {
    balanceLoading.value = false
  }
}

watch(
  () => [props.open, props.employee?.id, month.value],
  ([isOpen]) => {
    if (isOpen && props.employee) {
      amount.value = props.defaultAmount ?? ''
      reason.value = ''
      taskId.value = props.taskId ?? ''
      warningRef.value = ''
      confirmed.value = false
      submitError.value = ''
      decision.value = 'deducted'
      loadBalance()
    }
  },
  { immediate: true },
)

const projectedBalance = computed(() => {
  if (decision.value === 'let_it_go') return currentBalance.value
  const num = typeof amount.value === 'number' ? amount.value : 0
  return Math.round((currentBalance.value - num) * 100) / 100
})

const isValid = computed(() => {
  if (!reason.value.trim()) return false
  if (!confirmed.value) return false
  if (decision.value === 'deducted') {
    if (typeof amount.value !== 'number' || amount.value <= 0) return false
    if (amount.value > currentBalance.value) return false
  }
  return true
})

function setPresetAmount(val: number) {
  amount.value = Math.min(val, currentBalance.value)
}

async function submit() {
  if (!props.employee || !isValid.value || busy.value) return
  busy.value = true
  submitError.value = ''

  const idempotencyKey = crypto.randomUUID()

  try {
    const res = await api<PointDeduction>('/api/point-deductions', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: props.employee.id,
        amount: decision.value === 'deducted' ? Number(amount.value) : 0,
        reason: reason.value.trim(),
        task_id: taskId.value.trim() || null,
        warning_ref: warningRef.value.trim() || null,
        month: month.value,
        decision: decision.value,
        idempotency_key: idempotencyKey,
      }),
    })
    emit('saved', res)
    emit('close')
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : 'Failed to submit deduction'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="open && employee"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-xs"
  >
    <div
      class="panel max-h-[90vh] w-full max-w-xl overflow-y-auto border border-line shadow-2xl"
    >
      <div class="mb-4 flex items-center justify-between border-b border-line pb-3">
        <div>
          <h2 class="display text-xl text-teal">
            {{
              decision === 'let_it_go'
                ? '🕊️ Record Warning / Let It Go'
                : props.taskId !== undefined
                  ? '⚠️ Log Violation'
                  : '⚠️ Deduct Points'
            }}
          </h2>
          <p class="text-xs text-muted">
            Target employee: <strong class="text-ink">{{ employee.name }}</strong>
            <span v-if="employee.employee_code" class="mono text-muted"> ({{ employee.employee_code }})</span>
          </p>
          <p v-if="contextLabel" class="text-xs text-muted">
            Task: <strong class="text-ink">{{ contextLabel }}</strong>
          </p>
        </div>
        <button
          type="button"
          class="text-muted hover:text-ink text-lg leading-none"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Month Selection & Current Balance Bar -->
      <div class="mb-5 rounded-lg border border-line bg-paper/60 p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label class="text-xs text-muted block mb-1">Target Month</label>
            <input
              v-model="month"
              type="month"
              class="mono text-sm rounded border border-line bg-paper px-2 py-1"
              :disabled="busy || balanceLoading"
            />
          </div>
          <div class="flex items-center gap-4 text-right">
            <div>
              <span class="block text-[11px] text-muted uppercase">Earned</span>
              <span class="mono text-sm font-semibold">{{ earnedPoints }} pts</span>
            </div>
            <div>
              <span class="block text-[11px] text-muted uppercase">Deductions</span>
              <span class="mono text-sm font-semibold text-amber">-{{ deductedPoints }} pts</span>
            </div>
            <div class="border-l border-line pl-4">
              <span class="block text-[11px] text-muted uppercase">Current Balance</span>
              <span
                class="mono text-base font-bold"
                :class="currentBalance > 0 ? 'text-teal' : 'text-muted'"
              >
                {{ currentBalance }} pts
              </span>
            </div>
          </div>
        </div>
        <p v-if="balanceLoading" class="mt-2 text-xs text-teal animate-pulse">
          Refreshing balance…
        </p>
        <p v-if="fetchError" class="mt-2 text-xs text-red">
          {{ fetchError }}
        </p>
      </div>

      <!-- Action Type Toggle -->
      <div class="mb-4 flex gap-2">
        <button
          type="button"
          class="btn flex-1 text-sm py-2"
          :class="decision === 'deducted' ? 'btn-danger font-semibold' : 'opacity-70'"
          @click="decision = 'deducted'"
        >
          Deduct Points (Penalty)
        </button>
        <button
          type="button"
          class="btn flex-1 text-sm py-2"
          :class="decision === 'let_it_go' ? 'btn-solid font-semibold' : 'opacity-70'"
          @click="decision = 'let_it_go'"
        >
          Let It Go (Pardon & Audit)
        </button>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <!-- Penalty Amount (Deducted mode) -->
        <div v-if="decision === 'deducted'" class="rounded-lg border border-red/30 bg-red-soft/20 p-3">
          <label class="field-label flex items-center justify-between">
            <span>Points to Deduct *</span>
            <span v-if="currentBalance > 0" class="text-xs text-muted">
              Max available: {{ currentBalance }} pts
            </span>
          </label>
          <div class="mt-1 flex items-center gap-2">
            <input
              v-model.number="amount"
              type="number"
              step="0.5"
              min="0.5"
              :max="currentBalance"
              placeholder="e.g. 10"
              class="w-full rounded border border-line bg-paper px-3 py-1.5 mono text-lg font-bold"
              required
            />
            <span class="mono text-sm text-muted">points</span>
          </div>

          <!-- Quick presets -->
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span class="text-xs text-muted self-center mr-1">Presets:</span>
            <button
              v-for="p in [5, 10, 20, 50]"
              :key="p"
              type="button"
              class="btn btn-sm text-xs py-0.5 px-2"
              :disabled="p > currentBalance"
              @click="setPresetAmount(p)"
            >
              -{{ p }}
            </button>
            <button
              type="button"
              class="btn btn-sm text-xs py-0.5 px-2"
              :disabled="currentBalance <= 0"
              @click="setPresetAmount(currentBalance)"
            >
              All ({{ currentBalance }})
            </button>
          </div>

          <!-- Live Balance Preview -->
          <div class="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-sm">
            <span class="text-muted">Balance after deduction:</span>
            <span
              class="mono font-bold"
              :class="projectedBalance < 0 ? 'text-red' : 'text-teal'"
            >
              {{ projectedBalance }} points
            </span>
          </div>
          <p v-if="typeof amount === 'number' && amount > currentBalance" class="mt-1 text-xs text-red font-medium">
            Cannot deduct more than the current available balance ({{ currentBalance }} pts).
          </p>
        </div>

        <!-- Let It Go notice -->
        <div v-else class="rounded-lg border border-teal/40 bg-teal-soft/30 p-3 text-sm">
          <p class="font-medium text-teal">🕊️ Pardoning / Logging Incident with No Deduction</p>
          <p class="mt-1 text-xs text-muted">
            0 points will be deducted. An entry will still be recorded in the audit trail explaining the
            incident and why management decided to let it go.
          </p>
        </div>

        <!-- Reason -->
        <div>
          <label class="field-label block mb-1">
            Reason / Justification *
          </label>
          <textarea
            v-model="reason"
            rows="3"
            placeholder="Explain why this penalty or pardon is being issued (e.g. Unfinished task without notice, quality violation, warning issued)..."
            class="w-full rounded border border-line bg-paper px-3 py-2 text-sm"
            required
          ></textarea>
        </div>

        <!-- Optional Task ID / Warning Ref -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="field-label block mb-1">
              Related Task ID <span class="text-xs text-muted font-normal">(optional)</span>
            </label>
            <input
              v-model="taskId"
              type="text"
              placeholder="e.g. task UUID or reference"
              class="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-xs mono"
            />
          </div>
          <div>
            <label class="field-label block mb-1">
              Incident / Warning Ref <span class="text-xs text-muted font-normal">(optional)</span>
            </label>
            <input
              v-model="warningRef"
              type="text"
              placeholder="e.g. Incident #104 or memo"
              class="w-full rounded border border-line bg-paper px-2.5 py-1.5 text-xs mono"
            />
          </div>
        </div>

        <!-- Confirmation Checkbox -->
        <div class="rounded-lg border border-amber/30 bg-amber-soft/20 p-3">
          <label class="flex items-start gap-2 text-xs cursor-pointer select-none">
            <input
              v-model="confirmed"
              type="checkbox"
              class="mt-0.5"
            />
            <span class="text-muted">
              I confirm that this action is authorized and
              <strong class="text-ink">
                {{ decision === 'deducted' ? `will deduct ${amount || 0} points immediately` : 'will record a formal pardon' }}
              </strong>.
              This entry is permanent and will notify {{ employee.name }}.
            </span>
          </label>
        </div>

        <!-- Error Banner -->
        <p
          v-if="submitError"
          class="rounded-lg border border-red bg-red-soft p-3 text-xs text-red"
        >
          {{ submitError }}
        </p>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            class="btn"
            :disabled="busy"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn"
            :class="decision === 'deducted' ? 'btn-danger font-semibold' : 'btn-solid font-semibold'"
            :disabled="!isValid || busy || balanceLoading"
          >
            {{ busy ? 'Submitting…' : decision === 'deducted' ? 'Confirm & Deduct Points' : 'Record Decision' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
