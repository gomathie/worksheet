<script setup lang="ts">
// Admin drill-down for one employee's one month: every entry and every
// bonus/reimbursement, in the order it actually landed on the total, each
// with a running total — the "why did this number move" view that Payments
// and the Payslip don't have room for. Reached from Payments' payouts table
// (Trail button) or directly via ?employee_id=&month=.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import MonthPicker from '../components/MonthPicker.vue'
import type { Employee, FinanceTrail } from '../types'

const route = useRoute()
const router = useRouter()

const employees = ref<Employee[]>([])
const employeeId = ref(String(route.query.employee_id ?? ''))
const month = ref(String(route.query.month ?? new Date().toISOString().slice(0, 7)))
const trail = ref<FinanceTrail | null>(null)
const error = ref('')
const busy = ref(false)

const money = (n: number) => `${trail.value?.currency ?? ''}${n.toFixed(2)}`

async function load() {
  if (!employeeId.value) {
    trail.value = null
    return
  }
  error.value = ''
  busy.value = true
  try {
    trail.value = await api<FinanceTrail>(
      `/api/employees/${employeeId.value}/finance-trail?month=${month.value}`,
    )
  } catch (e) {
    trail.value = null
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
  if (!employeeId.value && employees.value.length) employeeId.value = employees.value[0].id
  await load()
})

watch([employeeId, month], () => {
  // Keep the URL shareable/bookmarkable — a "Trail" link elsewhere can point
  // straight at a specific employee+month.
  router.replace({ query: { employee_id: employeeId.value, month: month.value } })
  load()
})

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const timeLabel = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
})
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="display text-2xl">Finance trail</h2>
        <p class="text-sm text-muted">
          Every entry and adjustment behind one person's total, in the order it counted.
        </p>
      </div>
      <RouterLink :to="{ name: 'payments' }" class="btn btn-sm">← Back to Payments</RouterLink>
    </div>

    <div class="panel mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label class="field-label" for="ft-emp">Employee</label>
        <select id="ft-emp" v-model="employeeId" class="field-input !w-auto">
          <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </div>
      <div>
        <label class="field-label">Month</label>
        <MonthPicker v-model="month" />
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <template v-if="trail">
      <div class="panel mb-6">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="display text-xl">
            {{ trail.employee_name }}
            <span v-if="trail.employee_code" class="mono ml-2 text-sm text-muted">{{
              trail.employee_code
            }}</span>
          </h3>
          <span class="text-sm text-muted">{{ monthLabel }}</span>
        </div>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p class="field-label">Base</p>
            <p class="stat-figure">{{ money(trail.base) }}</p>
          </div>
          <div>
            <p class="field-label">Bonuses</p>
            <p class="stat-figure">{{ money(trail.bonus) }}</p>
          </div>
          <div>
            <p class="field-label">Reimbursements</p>
            <p class="stat-figure">{{ money(trail.reimbursements) }}</p>
          </div>
          <div>
            <p class="field-label">Total due</p>
            <p class="stat-figure text-teal">{{ money(trail.total_due) }}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-xs">
          <span
            class="display rounded-full border px-3 py-1 tracking-wider"
            :class="trail.paid_at ? 'border-teal text-teal' : 'border-line text-muted'"
          >
            {{ trail.paid_at ? 'Marked paid' : 'Not yet paid' }}
          </span>
          <span
            v-if="trail.locked"
            class="display rounded-full border border-line px-3 py-1 tracking-wider text-muted"
          >
            Month locked — rates frozen at time of lock
          </span>
        </div>
      </div>

      <div class="panel">
        <h3 class="display mb-3 text-xl">Accumulation trail</h3>
        <p v-if="trail.trail.length === 0" class="py-6 text-center text-muted">
          No entries or adjustments this month.
        </p>
        <div v-else class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>What happened</th>
                <th>By</th>
                <th class="num">Amount</th>
                <th class="num">Running total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in trail.trail"
                :key="line.kind + (line.kind === 'entry' ? line.entry_id : line.id)"
                :class="{ 'opacity-50': !line.counted }"
              >
                <td class="whitespace-nowrap">
                  {{ dateLabel(line.date) }}
                  <span v-if="line.kind === 'entry'" class="text-xs text-muted">{{
                    timeLabel(line.date)
                  }}</span>
                </td>
                <td>
                  <template v-if="line.kind === 'entry'">
                    <RouterLink
                      class="hover:underline"
                      :to="{
                        name: 'entries',
                        query: { month, employee_id: trail.employee_id, entry: line.entry_id },
                      }"
                    >
                      {{ line.hours.toFixed(2) }}h —
                      {{
                        line.items.length
                          ? line.items.map((i) => `${i.units}× ${i.name}`).join(', ')
                          : 'time only'
                      }}
                    </RouterLink>
                    <span v-if="line.status !== 'approved'" class="ml-2 text-xs text-muted">
                      ({{ line.status }} — not yet counted)
                    </span>
                  </template>
                  <template v-else>
                    {{ line.adj_type === 'bonus' ? 'Bonus' : 'Reimbursement' }}
                    <span v-if="line.description" class="text-muted"
                      >— {{ line.description }}</span
                    >
                    <span v-if="line.status !== 'approved'" class="ml-2 text-xs text-muted">
                      ({{ line.status }})
                    </span>
                  </template>
                </td>
                <td class="text-xs text-muted whitespace-nowrap">
                  <template v-if="line.kind === 'adjustment'">{{
                    line.created_by_name ?? '—'
                  }}</template>
                </td>
                <td class="num">
                  <template v-if="line.kind === 'entry'">
                    {{ line.value ? money(line.value) : '—' }}
                  </template>
                  <template v-else>{{ money(line.amount) }}</template>
                </td>
                <td class="num font-semibold">{{ line.counted ? money(line.running_total) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
    <p v-else-if="!busy && !error" class="panel py-10 text-center text-muted">
      Pick an employee to see their trail.
    </p>
  </div>
</template>
