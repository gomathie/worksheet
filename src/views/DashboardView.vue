<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import DailyBarChart from '../components/DailyBarChart.vue'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import type { ExpenseVoucher, ReportPayload } from '../types'

const auth = useAuthStore()
const month = ref(auth.user!.today.slice(0, 7))
const report = ref<ReportPayload | null>(null)
const error = ref('')

// Types to show as columns/series: active ones, plus any inactive type that
// still has units logged this month.
const visibleTypes = computed(() => {
  const r = report.value
  if (!r) return []
  return r.work_types.filter(
    (w) => w.active === undefined || w.active || (r.totals.units[w.id] ?? 0) > 0,
  )
})

// Recent expense activity, scoped server-side to what this viewer may see.
const recentExpenses = ref<ExpenseVoucher[]>([])

async function load() {
  error.value = ''
  try {
    report.value = await api<ReportPayload>(`/api/reports/monthly?month=${month.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load report'
  }
  try {
    const [y, m] = month.value.split('-').map(Number)
    const params = new URLSearchParams({
      from: `${month.value}-01`,
      to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    })
    recentExpenses.value = (await api<ExpenseVoucher[]>(`/api/expenses?${params}`)).slice(0, 8)
  } catch {
    // The expense panel is supplementary — a failure here must not blank the
    // rest of the dashboard.
    recentExpenses.value = []
  }
}

onMounted(load)
watch(month, load)

const money = (n: number) =>
  `${report.value?.settings.currency ?? '$'}${n.toFixed(2)}`
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Dashboard</h2>
      <MonthPicker v-model="month" />
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <template v-if="report">
      <!-- headline stats + teal stamp -->
      <div class="mb-6 flex flex-wrap items-stretch gap-4">
        <div
          class="display flex h-36 w-36 shrink-0 -rotate-6 flex-col items-center justify-center rounded-full border-4 border-teal text-teal"
        >
          <span class="mono text-3xl font-semibold">{{
            report.totals.hours.toFixed(1)
          }}</span>
          <span class="text-sm tracking-widest">Hours</span>
        </div>
        <div class="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
          <div v-for="wt in visibleTypes" :key="wt.id" class="panel">
            <p class="field-label">{{ wt.name }}</p>
            <p class="mono text-3xl font-semibold">
              {{ report.totals.units[wt.id] ?? 0 }}
            </p>
          </div>
          <template v-if="report.scope === 'full'">
            <div class="panel">
              <p class="field-label">Points</p>
              <p class="mono text-3xl font-semibold">{{ report.totals.points }}</p>
            </div>
            <div class="panel">
              <p class="field-label">Total due (incl. bonuses)</p>
              <p class="mono text-3xl font-semibold text-teal">
                {{ money(report.totals.total_due ?? report.totals.remuneration ?? 0) }}
              </p>
            </div>
          </template>
          <template v-else>
            <div class="panel">
              <p class="field-label">Your points</p>
              <p class="mono text-3xl font-semibold">
                {{ report.my_summary?.points ?? 0 }}
              </p>
            </div>
            <div class="panel">
              <p class="field-label">Due to you</p>
              <p class="mono text-3xl font-semibold text-teal">
                {{ money(report.my_summary?.total_due ?? report.my_summary?.remuneration ?? 0) }}
              </p>
            </div>
          </template>
        </div>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Per person</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Days</th>
                <th class="num">Hours</th>
                <th v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ wt.name }}
                </th>
                <template v-if="report.scope === 'full'">
                  <th class="num">Points</th>
                  <th class="num">Base</th>
                  <th class="num">Bonus</th>
                  <th class="num">Reimb.</th>
                  <th class="num">Total due</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in report.per_person" :key="p.employee_id">
                <td>{{ p.name }}</td>
                <td class="num">{{ p.days_worked }}</td>
                <td class="num">{{ p.hours.toFixed(2) }}</td>
                <td v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ p.units[wt.id] ?? 0 }}
                </td>
                <template v-if="report.scope === 'full'">
                  <td class="num">{{ p.points }}</td>
                  <td class="num">{{ money(p.remuneration ?? 0) }}</td>
                  <td class="num">{{ money(p.bonus ?? 0) }}</td>
                  <td class="num">{{ money(p.reimbursements ?? 0) }}</td>
                  <td class="num font-semibold">{{ money(p.total_due ?? 0) }}</td>
                </template>
              </tr>
              <tr v-if="report.per_person.length === 0">
                <td
                  :colspan="3 + visibleTypes.length + (report.scope === 'full' ? 5 : 0)"
                  class="py-6 text-center text-muted"
                >
                  No activity this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="recentExpenses.length" class="panel mb-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 class="display text-xl">Recent expense vouchers</h3>
          <RouterLink :to="{ name: 'expenses' }" class="btn btn-sm">View all</RouterLink>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th>Employee</th>
                <th>Description</th>
                <th class="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in recentExpenses" :key="v.id">
                <td class="mono whitespace-nowrap text-[13px]">
                  <RouterLink
                    :to="{ name: 'expense-detail', params: { id: v.id } }"
                    class="underline"
                    >{{ v.voucher_number }}</RouterLink
                  >
                </td>
                <td class="mono whitespace-nowrap">{{ v.expense_date }}</td>
                <td>{{ v.employee_name }}</td>
                <td class="max-w-56 truncate" :title="v.description">{{ v.description }}</td>
                <td class="num whitespace-nowrap">
                  {{ v.currency }}{{ v.amount.toFixed(2) }}
                </td>
                <td><ExpenseStatusChip :status="v.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-1 text-xl">Work by day</h3>
        <DailyBarChart
          :month="month"
          :daily="report.daily_totals"
          :work-types="visibleTypes"
        />
      </div>

      <div class="panel">
        <h3 class="display mb-3 text-xl">Daily detail</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th class="num">Hours</th>
                <th v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ wt.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in report.daily_detail" :key="i">
                <td class="mono whitespace-nowrap">{{ row.date }}</td>
                <td>{{ row.employee_name }}</td>
                <td class="num">{{ row.hours.toFixed(2) }}</td>
                <td v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ row.units[wt.id] ?? 0 }}
                </td>
              </tr>
              <tr v-if="report.daily_detail.length === 0">
                <td :colspan="3 + visibleTypes.length" class="py-6 text-center text-muted">
                  No entries this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
