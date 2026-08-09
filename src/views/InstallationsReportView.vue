<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import TrendChart from '../components/TrendChart.vue'
import { downloadCsv } from '../csv'
import {
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  INSTALLATION_ACTIONS,
  INSTALLATION_ACTION_LABELS,
} from '../../shared/installations'
import type { InstallationsReport } from '../types'

// How many installations were logged each month, across a year — total, by
// device make, and by whether it was a new install or a replacement. Counts
// every installation-style work type (currently just Telematics
// Installation); see shared/installations.ts.

const auth = useAuthStore()
const error = ref('')
const data = ref<InstallationsReport | null>(null)

const currentYear = Number(auth.user!.today.slice(0, 4))
const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
const year = ref(currentYear)

async function load() {
  error.value = ''
  try {
    data.value = await api<InstallationsReport>(`/api/installations-report?year=${year.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the report'
  }
}
onMounted(load)
watch(year, load)

// "2026-01" -> "Jan"
const monthLabels = computed(() =>
  (data.value?.months ?? []).map((m) => {
    const [y, mo] = m.split('-').map(Number)
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
  }),
)

const yearTotal = computed(() => (data.value?.total ?? []).reduce((a, n) => a + n, 0))

const deviceSeries = computed(() =>
  DEVICE_TYPES.filter((d) => (data.value?.by_device[d] ?? []).some((n) => n > 0)).map((d) => ({
    label: DEVICE_TYPE_LABELS[d],
    data: data.value!.by_device[d] ?? Array(12).fill(0),
  })),
)

const actionSeries = computed(() =>
  INSTALLATION_ACTIONS.map((a) => ({
    label: INSTALLATION_ACTION_LABELS[a].replace(' (faulty device)', ''),
    data: data.value?.by_action[a] ?? Array(12).fill(0),
  })),
)

function exportCsv() {
  if (!data.value) return
  const header = ['Month', 'Total', ...DEVICE_TYPES.map((d) => DEVICE_TYPE_LABELS[d]), ...INSTALLATION_ACTIONS.map((a) => INSTALLATION_ACTION_LABELS[a])]
  const rows = data.value.months.map((m, i) => [
    m,
    data.value!.total[i] ?? 0,
    ...DEVICE_TYPES.map((d) => data.value!.by_device[d]?.[i] ?? 0),
    ...INSTALLATION_ACTIONS.map((a) => data.value!.by_action[a]?.[i] ?? 0),
  ])
  downloadCsv(`installations-${year.value}.csv`, [header, ...rows])
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Installations</h2>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-sm" :disabled="!data" @click="exportCsv">Download CSV</button>
        <select v-model.number="year" class="field-input !w-auto" aria-label="Year">
          <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <template v-if="data">
      <div class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="panel">
          <p class="field-label">Total for {{ year }}</p>
          <p class="stat-figure">{{ yearTotal }}</p>
        </div>
        <div v-for="a in INSTALLATION_ACTIONS" :key="a" class="panel">
          <p class="field-label">{{ INSTALLATION_ACTION_LABELS[a] }}</p>
          <p class="stat-figure">
            {{ (data.by_action[a] ?? []).reduce((s, n) => s + n, 0) }}
          </p>
        </div>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Installations per month</h3>
        <TrendChart
          v-if="yearTotal > 0"
          :labels="monthLabels"
          :series="[{ label: 'Installations', data: data.total }]"
        />
        <p v-else class="py-6 text-center text-muted">No installations logged in {{ year }}.</p>
      </div>

      <div v-if="deviceSeries.length" class="panel mb-6">
        <h3 class="display mb-3 text-xl">By device type</h3>
        <TrendChart :labels="monthLabels" :series="deviceSeries" />
      </div>

      <div v-if="yearTotal > 0" class="panel mb-6">
        <h3 class="display mb-3 text-xl">New installations vs. replacements</h3>
        <TrendChart :labels="monthLabels" :series="actionSeries" />
      </div>

      <div class="panel">
        <h3 class="display mb-3 text-xl">By month</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Month</th>
                <th class="num">Total</th>
                <th v-for="d in DEVICE_TYPES" :key="d" class="num">{{ DEVICE_TYPE_LABELS[d] }}</th>
                <th v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ INSTALLATION_ACTION_LABELS[a] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, i) in data.months" :key="m">
                <td class="mono">{{ monthLabels[i] }}</td>
                <td class="num">{{ data.total[i] ?? 0 }}</td>
                <td v-for="d in DEVICE_TYPES" :key="d" class="num">
                  {{ data.by_device[d]?.[i] ?? 0 }}
                </td>
                <td v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ data.by_action[a]?.[i] ?? 0 }}
                </td>
              </tr>
              <tr class="font-medium" style="border-top: 2px solid var(--color-ink)">
                <td>Total</td>
                <td class="num">{{ yearTotal }}</td>
                <td v-for="d in DEVICE_TYPES" :key="d" class="num">
                  {{ (data.by_device[d] ?? []).reduce((s, n) => s + n, 0) }}
                </td>
                <td v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ (data.by_action[a] ?? []).reduce((s, n) => s + n, 0) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
