<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import type { Employee, MyRemuneration } from '../types'

const auth = useAuthStore()
const month = ref(auth.user!.today.slice(0, 7))
const slip = ref<MyRemuneration | null>(null)
const error = ref('')

// Admins can pick whose payslip to view; employees only see their own.
const employees = ref<Employee[]>([])
const selectedId = ref(auth.user!.id)

async function load() {
  error.value = ''
  try {
    const path = auth.isAdmin
      ? `/api/employees/${selectedId.value}/remuneration?month=${month.value}`
      : `/api/me/remuneration?month=${month.value}`
    slip.value = await api<MyRemuneration>(path)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load payslip'
  }
}

onMounted(async () => {
  if (auth.isAdmin) {
    employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
  }
  await load()
})
watch([month, selectedId], load)

const money = (n: number) => `${slip.value?.currency ?? ''}${n.toFixed(2)}`

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
})

const generatedOn = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const workRows = computed(() =>
  (slip.value?.work_types ?? [])
    .map((wt) => ({ name: wt.name, units: slip.value?.units[wt.id] ?? 0 }))
    .filter((r) => r.units > 0),
)

const bonuses = computed(() =>
  (slip.value?.adjustments ?? []).filter(
    (a) => a.type === 'bonus' && a.status === 'approved',
  ),
)
const reimbursements = computed(() =>
  (slip.value?.adjustments ?? []).filter(
    (a) => a.type === 'reimbursement' && a.status === 'approved',
  ),
)

const printPage = () => window.print()
</script>

<template>
  <div>
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Payslip</h2>
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-if="auth.isAdmin"
          v-model="selectedId"
          class="field-input !w-auto"
          aria-label="Employee"
        >
          <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
        <MonthPicker v-model="month" />
        <button class="btn btn-solid" :disabled="!slip" @click="printPage">
          Print / Save as PDF
        </button>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div v-if="slip" class="panel mx-auto max-w-2xl">
      <header class="mb-6 flex items-start justify-between border-b-2 border-ink pb-4">
        <div>
          <h1 class="display text-3xl">Payslip</h1>
          <p class="mt-1 text-sm text-muted">
            <span class="display mr-2 text-base text-ink">{{ slip.employee_name }}</span>
            <span v-if="slip.employee_code" class="mono mr-2">{{ slip.employee_code }}</span>
            · {{ monthLabel }}
          </p>
        </div>
        <div
          class="display flex h-12 w-12 -rotate-6 items-center justify-center rounded-full border-2 border-ink text-[15px]"
        >
          LG
        </div>
      </header>

      <!-- work output -->
      <section class="mb-5">
        <h3 class="field-label mb-2">Work this month</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Item</th>
                <th class="num">Units</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hours worked</td>
                <td class="num">{{ slip.hours.toFixed(2) }}</td>
              </tr>
              <tr v-for="r in workRows" :key="r.name">
                <td>{{ r.name }}</td>
                <td class="num">{{ r.units }}</td>
              </tr>
              <tr v-if="workRows.length === 0">
                <td colspan="2" class="text-muted">No countable output logged.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- pay breakdown -->
      <section>
        <h3 class="field-label mb-2">Pay breakdown</h3>
        <div class="table-wrap">
          <table class="data">
            <tbody>
              <tr>
                <td>Base pay</td>
                <td class="num">{{ money(slip.base) }}</td>
              </tr>
              <tr v-for="b in bonuses" :key="b.id">
                <td>Bonus — <span class="text-muted">{{ b.description }}</span></td>
                <td class="num">{{ money(b.amount) }}</td>
              </tr>
              <tr v-for="r in reimbursements" :key="r.id">
                <td>Reimbursement — <span class="text-muted">{{ r.description }}</span></td>
                <td class="num">{{ money(r.amount) }}</td>
              </tr>
              <tr class="totals">
                <td>Total due</td>
                <td class="num">{{ money(slip.total_due) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- status -->
      <div class="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
        <span
          class="display rounded-full border px-3 py-1 text-xs tracking-wider"
          :class="slip.paid_at ? 'border-teal text-teal' : 'border-line text-muted'"
        >
          {{ slip.paid_at ? 'Paid' : 'Not yet paid' }}
        </span>
        <span
          class="display rounded-full border px-3 py-1 text-xs tracking-wider"
          :class="slip.confirmed_at ? 'border-teal text-teal' : 'border-line text-muted'"
        >
          {{ slip.confirmed_at ? 'Receipt confirmed' : 'Receipt not confirmed' }}
        </span>
      </div>

      <footer class="mt-5 border-t border-line pt-3 text-xs text-muted">
        Generated {{ generatedOn }}. Manage payment status and reimbursements on the
        Payments tab.
      </footer>
    </div>
  </div>
</template>
