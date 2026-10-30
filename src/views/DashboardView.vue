<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { formatDayHeading, groupByDay } from '../dates'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import DailyBarChart from '../components/DailyBarChart.vue'
import TrendChart from '../components/TrendChart.vue'
import ExpenseStatusChip from '../components/ExpenseStatusChip.vue'
import { percentChange } from '../../shared/logic'
import type { ExpenseVoucher, ReportPayload, TrendData } from '../types'

const auth = useAuthStore()
// The router normally loads the user before this view mounts, but a session
// can disappear while the view is still alive (for example after a 401). Keep
// the dashboard's reactive state safe during that redirect window as well.
const initialToday = auth.user?.today ?? new Date().toISOString().slice(0, 10)
const month = ref(initialToday.slice(0, 7))
const rangeMode = ref<'month' | 'custom'>('month')
const fromDate = ref(initialToday.slice(0, 8) + '01')
const toDate = ref(initialToday)
const report = ref<ReportPayload | null>(null)
const error = ref('')

// Types to show as columns/series: active ones, plus any inactive type that
// still has units logged this month — then scoped to the viewer's own
// assignments (admins see everything).
const myTypeIds = computed(
  () => new Set((auth.user?.work_types ?? []).map((w) => w.id)),
)
const visibleTypes = computed(() => {
  const r = report.value
  if (!r) return []
  return r.work_types.filter(
    (w) =>
      (w.active === undefined || w.active || (r.totals.units[w.id] ?? 0) > 0) &&
      (auth.isAdmin || myTypeIds.value.has(w.id)),
  )
})

// Recent expense activity, scoped server-side to what this viewer may see.
const recentExpenses = ref<ExpenseVoucher[]>([])

// The viewer's own productivity over the last three months. Deliberately
// independent of the month picker above: "last 3 months" is anchored to
// today, not to whichever month is being browsed. The trends endpoint only
// ever returns the caller's own data for a non-admin, so this can't leak a
// colleague's figures.
const trend = ref<TrendData | null>(null)

async function loadTrend() {
  try {
    trend.value = await api<TrendData>('/api/trends?months=3')
  } catch {
    // Supplementary panel — a failure here must not blank the dashboard.
    trend.value = null
  }
}

async function load() {
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (rangeMode.value === 'custom') {
      params.set('from', fromDate.value)
      params.set('to', toDate.value)
    } else {
      params.set('month', month.value)
    }
    report.value = await api<ReportPayload>(`/api/reports/monthly?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load report'
  }
  try {
    let from = fromDate.value
    let to = toDate.value
    if (rangeMode.value === 'month') {
      const [y, m] = month.value.split('-').map(Number)
      from = `${month.value}-01`
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    }
    const params = new URLSearchParams({ from, to })
    recentExpenses.value = (await api<ExpenseVoucher[]>(`/api/expenses?${params}`)).slice(0, 8)
  } catch {
    // The expense panel is supplementary — a failure here must not blank the
    // rest of the dashboard.
    recentExpenses.value = []
  }
}

onMounted(() => {
  void load()
  void loadTrend()
})
// The trend window is fixed, so it is fetched once rather than on every
// range change.
watch([month, rangeMode, fromDate, toDate], load)

const money = (n: number) =>
  `${report.value?.settings.currency ?? '$'}${n.toFixed(2)}`

// Same grouping as the Recent entries table: a day worked (or logged) more
// than once is one day, not several unrelated rows sharing a date.
const dailyGroups = computed(() =>
  groupByDay(
    report.value?.daily_detail ?? [],
    (row) => row.date,
    (row) => row.hours,
  ),
)

// --- the viewer's own attendance for the month
const myDays = computed(() => report.value?.my_days ?? [])
const myDaysWorked = computed(() => report.value?.my_days_worked ?? 0)
const myDaysMissed = computed(() => myDays.value.length - myDaysWorked.value)

// --- the viewer's own three-month productivity
const trendMonths = computed(() => trend.value?.months ?? [])

// "2026-07" -> "Jul 26", matching the Trends page.
const trendLabels = computed(() =>
  trendMonths.value.map((m) => {
    const [y, mo] = m.split('-').map(Number)
    const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    return `${name} ${String(y).slice(2)}`
  }),
)

// Per-type series, scoped to the viewer's own assignments the same way the
// columns below are. The endpoint returns whatever types this employee has
// ever logged against, including ones they are no longer assigned.
const trendSeries = computed(() => {
  const t = trend.value
  if (!t) return []
  return t.work_types
    .filter((wt) => auth.isAdmin || myTypeIds.value.has(wt.id))
    .map((wt) => ({ label: wt.name, data: t.units[wt.id] ?? [] }))
})

const trendUnitTotals = computed(() =>
  trendMonths.value.map((_, i) =>
    trendSeries.value.reduce((sum, s) => sum + (s.data[i] ?? 0), 0),
  ),
)

/** The month before `i`, or undefined for the first one — nothing to compare to. */
function prevMonth(values: number[], i: number): number | undefined {
  return i === 0 ? undefined : values[i - 1]
}

/** "+18%", "-12%", or a dash when there is no month to compare against. */
function deltaText(cur: number, prev: number | undefined): string {
  const pct = percentChange(cur, prev)
  if (pct === null) return '—'
  return `${pct > 0 ? '+' : ''}${pct}%`
}

// A decline is not an error, so it stays muted rather than red.
function deltaClass(cur: number, prev: number | undefined): string {
  return (percentChange(cur, prev) ?? 0) > 0 ? 'text-teal' : 'text-muted'
}

/** Day-of-month number, for the compact marker grid. */
const dayNum = (date: string) => Number(date.slice(8, 10))

function dayTitle(d: { date: string; worked: boolean; entry: boolean; task: boolean }): string {
  if (!d.worked) return `${d.date} — no work done`
  const what = [d.entry ? 'time logged' : null, d.task ? 'task completed' : null]
    .filter(Boolean)
    .join(' + ')
  return `${d.date} — ${what}`
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display shrink-0 text-2xl">Dashboard</h2>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <select
          v-model="rangeMode"
          class="field-input w-full bg-transparent py-1 text-sm sm:w-auto"
          aria-label="Dashboard date range"
        >
          <option value="month">Month</option>
          <option value="custom">Custom</option>
        </select>
        <MonthPicker v-if="rangeMode === 'month'" v-model="month" class="w-full sm:w-auto" />
        <div v-else class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-1">
          <label class="flex w-full items-center gap-2 sm:w-auto">
            <span class="text-sm text-muted sm:sr-only">From</span>
            <input
              id="dashboard-from-date"
              v-model="fromDate"
              type="date"
              class="field-input mono min-w-0 flex-1 py-1 text-sm"
              aria-label="Dashboard start date"
            />
          </label>
          <span class="hidden text-muted sm:inline" aria-hidden="true">to</span>
          <label class="flex w-full items-center gap-2 sm:w-auto">
            <span class="text-sm text-muted sm:sr-only">To</span>
            <input
              id="dashboard-to-date"
              v-model="toDate"
              type="date"
              class="field-input mono min-w-0 flex-1 py-1 text-sm"
              aria-label="Dashboard end date"
            />
          </label>
        </div>
      </div>
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
        <!-- basis-full drops the tiles below the hours circle on a phone;
             sharing the row leaves them ~43px of content and clips the
             figures. From md they sit alongside it again. -->
        <div class="grid basis-full grid-cols-2 gap-4 md:flex-1 md:basis-0 md:grid-cols-4">
          <!-- The viewer's own attendance, first among the tiles: it's about
               them, not the team, so it leads regardless of which rights
               they hold. -->
          <div class="panel">
            <p class="field-label">Your days worked</p>
            <p class="stat-figure text-teal">{{ myDaysWorked }}</p>
            <p class="mt-1 text-xs text-muted">of {{ myDays.length }} so far</p>
          </div>
          <div v-for="wt in visibleTypes" :key="wt.id" class="panel">
            <p class="field-label">{{ wt.name }}</p>
            <p class="stat-figure">{{ report.totals.units[wt.id] ?? 0 }}</p>
          </div>
          <template v-if="report.scope === 'full'">
            <div class="panel">
              <p class="field-label">Points</p>
              <p class="stat-figure">{{ report.totals.points }}</p>
            </div>
            <!-- Money needs the whole row on a phone: a half-width tile leaves
                 115px of content, and a formatted total wants ~180px. -->
            <div class="panel col-span-2 md:col-span-1">
              <p class="field-label">Total due (incl. bonuses)</p>
              <p class="stat-figure text-teal">
                {{ money(report.totals.total_due ?? report.totals.remuneration ?? 0) }}
              </p>
            </div>
          </template>
          <template v-else-if="report.my_summary?.remuneration !== undefined">
            <div class="panel col-span-2 md:col-span-1">
              <p class="field-label">Due to you</p>
              <p class="stat-figure text-teal">
                {{ money(report.my_summary.total_due ?? report.my_summary.remuneration) }}
              </p>
            </div>
          </template>
          <template v-else-if="report.my_summary?.points !== undefined">
            <div class="panel">
              <p class="field-label">Your points</p>
              <p class="stat-figure">{{ report.my_summary.points }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Day-by-day attendance for the viewer. Every elapsed day of the
           month is shown, so a day with nothing logged reads as an explicit
           "no work done" rather than simply being absent from a list. -->
      <div v-if="myDays.length" class="panel mb-6">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="display text-xl">Your days this month</h3>
          <p class="text-sm text-muted">
            <span class="text-teal">{{ myDaysWorked }} worked</span>
            <span v-if="myDaysMissed"> · {{ myDaysMissed }} with no work done</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="d in myDays"
            :key="d.date"
            class="mono flex h-9 w-9 items-center justify-center rounded border text-xs"
            :class="
              d.worked
                ? 'border-teal bg-teal-soft text-teal'
                : 'border-line bg-cream text-muted'
            "
            :title="dayTitle(d)"
          >
            {{ dayNum(d.date) }}
          </div>
        </div>
        <p class="mt-3 text-xs text-muted">
          A day counts as worked if you logged time or completed a task on it. Days still to
          come this month aren't shown.
        </p>
      </div>

      <!-- The viewer's own three months, side by side. Sits with the personal
           block above rather than among the team panels: it answers "how am I
           doing?", not "how is everyone doing?". -->
      <div v-if="trend && trendMonths.length" class="panel mb-6">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="display text-xl">Your productivity — last 3 months</h3>
          <p class="text-sm text-muted">Units logged, by work type</p>
        </div>

        <TrendChart v-if="trendSeries.length" :labels="trendLabels" :series="trendSeries" />
        <p v-else class="py-6 text-center text-muted">
          No countable work logged in the last 3 months.
        </p>

        <div class="table-wrap mt-4">
          <table class="data">
            <thead>
              <tr>
                <th>Month</th>
                <th class="num">Units</th>
                <th class="num">vs prior</th>
                <th class="num">Hours</th>
                <th class="num">vs prior</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, i) in trendMonths" :key="m">
                <td class="mono whitespace-nowrap">
                  {{ trendLabels[i] }}
                  <span v-if="i === trendMonths.length - 1" class="ml-2 text-xs text-muted">
                    month to date
                  </span>
                </td>
                <td class="num">{{ trendUnitTotals[i] }}</td>
                <td class="num">
                  <span :class="deltaClass(trendUnitTotals[i], prevMonth(trendUnitTotals, i))">
                    {{ deltaText(trendUnitTotals[i], prevMonth(trendUnitTotals, i)) }}
                  </span>
                </td>
                <td class="num">{{ trend.hours[i].toFixed(2) }}</td>
                <td class="num">
                  <span :class="deltaClass(trend.hours[i], prevMonth(trend.hours, i))">
                    {{ deltaText(trend.hours[i], prevMonth(trend.hours, i)) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-3 text-xs text-muted">
          The current month is still in progress, so it reads low against the two completed
          months beside it.
        </p>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Per person</h3>
        <div class="table-wrap">
          <table class="data per-person-table">
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
              <template v-for="g in dailyGroups" :key="g.date">
                <tr class="group-head">
                  <td :colspan="3 + visibleTypes.length">
                    {{ formatDayHeading(g.date) }}
                    <span class="mono ml-2 text-teal">{{ g.totalHours.toFixed(2) }}h</span>
                    <span v-if="g.rows.length > 1" class="ml-2 normal-case text-muted"
                      >· {{ g.rows.length }} entries</span
                    >
                  </td>
                </tr>
                <tr v-for="(row, i) in g.rows" :key="i">
                  <td class="mono whitespace-nowrap">{{ row.date }}</td>
                  <td>{{ row.employee_name }}</td>
                  <td class="num">{{ row.hours.toFixed(2) }}</td>
                  <td v-for="wt in visibleTypes" :key="wt.id" class="num">
                    {{ row.units[wt.id] ?? 0 }}
                  </td>
                </tr>
              </template>
              <tr v-if="dailyGroups.length === 0">
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
