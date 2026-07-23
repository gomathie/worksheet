<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import DailyBarChart from '../components/DailyBarChart.vue'
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
          <div class="panel">
            <p class="field-label">Classifications</p>
            <p class="mono text-3xl font-semibold">{{ report.totals.classifications }}</p>
          </div>
          <div class="panel">
            <p class="field-label">QAP</p>
            <p class="mono text-3xl font-semibold">{{ report.totals.qap }}</p>
          </div>
          <div class="panel">
            <p class="field-label">Points</p>
            <p class="mono text-3xl font-semibold">{{ report.totals.points }}</p>
          </div>
          <div class="panel">
            <p class="field-label">Est. remuneration</p>
            <p class="mono text-3xl font-semibold text-teal">
              {{ money(report.totals.remuneration) }}
            </p>
          </div>
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
                <th class="num">Classif.</th>
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
              <tr v-if="report.per_person.length === 0">
                <td colspan="7" class="py-6 text-center text-muted">
                  No activity this month.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-1 text-xl">Classifications &amp; QAP by day</h3>
        <DailyBarChart :month="month" :daily="report.daily_totals" />
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
                <th class="num">Classif.</th>
                <th class="num">QAP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in report.daily_detail" :key="i">
                <td class="mono whitespace-nowrap">{{ row.date }}</td>
                <td>{{ row.employee_name }}</td>
                <td class="num">{{ row.hours.toFixed(2) }}</td>
                <td class="num">{{ row.classifications }}</td>
                <td class="num">{{ row.qap }}</td>
              </tr>
              <tr v-if="report.daily_detail.length === 0">
                <td colspan="5" class="py-6 text-center text-muted">
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
