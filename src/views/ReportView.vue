<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
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

const rateNote = computed(() => {
  const s = report.value?.settings
  if (!s) return ''
  return `Rates applied: ${s.points_per_classification} point(s) per classification, ${s.points_per_qap} per QAP, ${s.currency}${s.point_value.toFixed(2)} per point.`
})
</script>

<template>
  <div>
    <div class="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Monthly report</h2>
      <div class="flex flex-wrap items-center gap-3">
        <MonthPicker v-model="month" />
        <button class="btn btn-solid" @click="printPage">
          Print / Save as PDF
        </button>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div v-if="report" class="panel">
      <header class="mb-6 border-b-2 border-ink pb-4">
        <h1 class="display text-3xl">Ledger — Monthly Report</h1>
        <p class="mt-1 text-sm text-muted">
          <span class="display mr-3 text-base text-ink">{{ monthLabel }}</span>
          Generated {{ generatedOn }}
        </p>
      </header>

      <section class="print-block mb-8">
        <h3 class="display mb-3 text-xl">Per-person summary</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Employee</th>
                <th class="num">Days worked</th>
                <th class="num">Hours</th>
                <th class="num">Classifications</th>
                <th class="num">QAP</th>
                <th class="num">Points</th>
                <th class="num">Remuneration</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in report.per_person" :key="p.employee_id">
                <td>{{ p.name }}</td>
                <td class="num">{{ p.days_worked }}</td>
                <td class="num">{{ p.hours.toFixed(2) }}</td>
                <td class="num">{{ p.classifications }}</td>
                <td class="num">{{ p.qap }}</td>
                <td class="num">{{ p.points }}</td>
                <td class="num">{{ money(p.remuneration) }}</td>
              </tr>
              <tr class="totals">
                <td>Total</td>
                <td class="num">{{ report.totals.days_worked }}</td>
                <td class="num">{{ report.totals.hours.toFixed(2) }}</td>
                <td class="num">{{ report.totals.classifications }}</td>
                <td class="num">{{ report.totals.qap }}</td>
                <td class="num">{{ report.totals.points }}</td>
                <td class="num">{{ money(report.totals.remuneration) }}</td>
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
                <th class="num">Classifications</th>
                <th class="num">QAP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in report.daily_detail" :key="i">
                <td class="mono whitespace-nowrap">{{ row.date }}</td>
                <td>{{ row.employee_name }}</td>
                <td class="num">{{ row.time_start }}</td>
                <td class="num">{{ row.time_end }}</td>
                <td class="num">{{ row.hours.toFixed(2) }}</td>
                <td class="num">{{ row.classifications }}</td>
                <td class="num">{{ row.qap }}</td>
              </tr>
              <tr v-if="report.daily_detail.length === 0">
                <td colspan="7" class="py-6 text-center text-muted">
                  No entries this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer class="border-t border-line pt-3 text-xs text-muted">
        {{ rateNote }}
      </footer>
    </div>
  </div>
</template>
