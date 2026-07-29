<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import type { ReportPayload } from '../types'

const auth = useAuthStore()
const month = ref(auth.user!.today.slice(0, 7))
const report = ref<ReportPayload | null>(null)
const error = ref('')

async function load() {
  error.value = ''
  try {
    report.value = await api<ReportPayload>(`/api/reports/monthly?month=${month.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load report'
  }
}

onMounted(load)
watch(month, load)

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

const money = (n: number) =>
  `${report.value?.settings.currency ?? '$'}${n.toFixed(2)}`

const printPage = () => window.print()

const busy = ref(false)

async function toggleLock() {
  if (!report.value) return
  error.value = ''
  busy.value = true
  try {
    if (report.value.locked) {
      await api(`/api/locks/${month.value}`, { method: 'DELETE' })
    } else {
      if (
        !confirm(
          `Lock ${monthLabel.value}? This freezes its rates and prevents further ` +
            `changes to entries, bonuses, and reimbursements for the month.`,
        )
      )
        return
      await api('/api/locks', { method: 'POST', json: { month: month.value } })
    }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update lock'
  } finally {
    busy.value = false
  }
}

function exportSummaryCsv() {
  const r = report.value
  if (!r) return
  const full = r.scope === 'full'
  const header = [
    'Employee',
    'Days worked',
    'Hours',
    ...visibleTypes.value.map((w) => w.name),
    ...(full ? ['Points', 'Base', 'Bonus', 'Reimbursements', 'Total due'] : []),
  ]
  const rows = r.per_person.map((p) => [
    p.name,
    p.days_worked,
    p.hours,
    ...visibleTypes.value.map((w) => p.units[w.id] ?? 0),
    ...(full
      ? [p.points ?? 0, p.remuneration ?? 0, p.bonus ?? 0, p.reimbursements ?? 0, p.total_due ?? 0]
      : []),
  ])
  const totals = [
    'Total',
    r.totals.days_worked,
    r.totals.hours,
    ...visibleTypes.value.map((w) => r.totals.units[w.id] ?? 0),
    ...(full
      ? [
          r.totals.points ?? 0,
          r.totals.remuneration ?? 0,
          r.totals.bonus ?? 0,
          r.totals.reimbursements ?? 0,
          r.totals.total_due ?? 0,
        ]
      : []),
  ]
  downloadCsv(`report-summary-${month.value}.csv`, [header, ...rows, totals])
}

function exportDailyCsv() {
  const r = report.value
  if (!r) return
  const header = [
    'Date',
    'Employee',
    'Start',
    'End',
    'Hours',
    ...visibleTypes.value.map((w) => w.name),
  ]
  const rows = r.daily_detail.map((row) => [
    row.date,
    row.employee_name,
    row.time_start,
    row.time_end,
    row.hours,
    ...visibleTypes.value.map((w) => row.units[w.id] ?? 0),
  ])
  downloadCsv(`report-daily-${month.value}.csv`, [header, ...rows])
}

const visibleTypes = computed(() => {
  const r = report.value
  if (!r) return []
  return r.work_types.filter(
    (w) => w.active === undefined || w.active || (r.totals.units[w.id] ?? 0) > 0,
  )
})

const rateNote = computed(() => {
  const r = report.value
  if (!r || r.scope !== 'full' || r.settings.point_value === undefined) return ''
  const parts = visibleTypes.value
    .filter((w) => w.points_per_unit !== undefined)
    .map((w) => `${w.name} ${w.points_per_unit} pt/unit`)
  return `Rates applied: ${parts.join(', ')}; ${r.settings.currency}${r.settings.point_value.toFixed(2)} per point. Totals include bonuses and approved reimbursements.`
})
</script>

<template>
  <div>
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Monthly report</h2>
      <div class="flex flex-wrap items-center gap-3">
        <MonthPicker v-model="month" />
        <button class="btn" :disabled="!report" @click="exportSummaryCsv">
          Summary CSV
        </button>
        <button class="btn" :disabled="!report" @click="exportDailyCsv">
          Daily CSV
        </button>
        <button class="btn btn-solid" @click="printPage">
          Print / Save as PDF
        </button>
        <button
          v-if="auth.isAdmin && report"
          class="btn"
          :class="report.locked ? 'btn-danger' : ''"
          :disabled="busy"
          @click="toggleLock"
        >
          {{ report.locked ? 'Unlock month' : 'Lock month' }}
        </button>
      </div>
    </div>

    <p
      v-if="report && report.locked"
      class="no-print mb-6 rounded-lg border border-teal bg-teal-soft px-4 py-2 text-sm"
    >
      🔒 This month is locked. Its rates are frozen and entries, bonuses, and
      reimbursements can't be changed until it's unlocked.
    </p>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div v-if="report" class="panel">
      <header class="mb-6 border-b-2 border-ink pb-4">
        <h1 class="display text-3xl">Ledger — Monthly Report</h1>
        <p class="mt-1 text-sm text-muted">
          <span class="display mr-3 text-base text-ink">{{ monthLabel }}</span>
          Generated {{ generatedOn }}
        </p>
      </header>

      <section
        v-if="report.scope === 'limited' && report.my_summary"
        class="print-block mb-8"
      >
        <div class="rounded-lg border border-teal bg-teal-soft p-4">
          <p class="field-label">Amount due to you this month</p>
          <p class="mono text-3xl font-semibold text-teal">
            {{ money(report.my_summary.total_due ?? report.my_summary.remuneration) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ report.my_summary.points }} point(s) = {{ money(report.my_summary.remuneration) }}
            <template v-if="report.my_summary.bonus">
              + {{ money(report.my_summary.bonus) }} bonus</template
            >
            <template v-if="report.my_summary.reimbursements">
              + {{ money(report.my_summary.reimbursements) }} reimbursements</template
            >
            for {{ monthLabel }}.
          </p>
        </div>
      </section>

      <section class="print-block mb-8">
        <h3 class="display mb-3 text-xl">Per-person summary</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Days worked</th>
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
              <tr class="totals">
                <td>Total</td>
                <td class="num">{{ report.totals.days_worked }}</td>
                <td class="num">{{ report.totals.hours.toFixed(2) }}</td>
                <td v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ report.totals.units[wt.id] ?? 0 }}
                </td>
                <template v-if="report.scope === 'full'">
                  <td class="num">{{ report.totals.points }}</td>
                  <td class="num">{{ money(report.totals.remuneration ?? 0) }}</td>
                  <td class="num">{{ money(report.totals.bonus ?? 0) }}</td>
                  <td class="num">{{ money(report.totals.reimbursements ?? 0) }}</td>
                  <td class="num font-semibold">{{ money(report.totals.total_due ?? 0) }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="print-block mb-8">
        <h3 class="display mb-3 text-xl">Daily detail</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th class="num">Start</th>
                <th class="num">End</th>
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
                <td class="num">{{ row.time_start }}</td>
                <td class="num">{{ row.time_end }}</td>
                <td class="num">{{ row.hours.toFixed(2) }}</td>
                <td v-for="wt in visibleTypes" :key="wt.id" class="num">
                  {{ row.units[wt.id] ?? 0 }}
                </td>
              </tr>
              <tr v-if="report.daily_detail.length === 0">
                <td :colspan="5 + visibleTypes.length" class="py-6 text-center text-muted">
                  No entries this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer v-if="rateNote" class="border-t border-line pt-3 text-xs text-muted">
        {{ rateNote }}
      </footer>
    </div>
  </div>
</template>
