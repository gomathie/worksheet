<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import TrendChart from '../components/TrendChart.vue'
import { downloadCsv } from '../csv'
import { INSTALLATION_ACTIONS, INSTALLATION_ACTION_LABELS } from '../../shared/installations'
import type { InstallationsReport } from '../types'

// How many installations were logged each month, across a year — total, by
// device make, by whether it was a new install or a replacement, and (for
// replacements) which make came out, to answer "what's mostly faulty".
// Counts every installation-style work type (currently just Telematics
// Installation); see shared/installations.ts. Device names come back
// resolved from the report itself — nothing here needs its own device-types
// fetch.

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
const sumOf = (arr: number[] | undefined) => (arr ?? []).reduce((a, n) => a + n, 0)

const deviceNames = computed(() => Object.keys(data.value?.by_device ?? {}).sort())
const deviceSeries = computed(() =>
  deviceNames.value.map((name) => ({ label: name, data: data.value!.by_device[name] })),
)

const actionSeries = computed(() =>
  INSTALLATION_ACTIONS.map((a) => ({
    label: INSTALLATION_ACTION_LABELS[a].replace(' (faulty device)', ''),
    data: data.value?.by_action[a] ?? Array(12).fill(0),
  })),
)

// Ranked so the most-replaced make (the one worth raising with a supplier)
// reads first, without having to compare bars across a chart.
const faultyRanked = computed(() =>
  Object.entries(data.value?.by_replaced_device ?? {})
    .map(([name, months]) => ({ name, total: sumOf(months) }))
    .sort((a, b) => b.total - a.total),
)
const faultyTotal = computed(() => faultyRanked.value.reduce((s, r) => s + r.total, 0))
const faultySeries = computed(() =>
  faultyRanked.value.map((r) => ({ label: r.name, data: data.value!.by_replaced_device[r.name] })),
)

function exportCsv() {
  if (!data.value) return
  const header = [
    'Month',
    'Total',
    ...deviceNames.value,
    ...INSTALLATION_ACTIONS.map((a) => INSTALLATION_ACTION_LABELS[a]),
    ...faultyRanked.value.map((r) => `Replaced: ${r.name}`),
  ]
  const rows = data.value.months.map((m, i) => [
    m,
    data.value!.total[i] ?? 0,
    ...deviceNames.value.map((name) => data.value!.by_device[name]?.[i] ?? 0),
    ...INSTALLATION_ACTIONS.map((a) => data.value!.by_action[a]?.[i] ?? 0),
    ...faultyRanked.value.map((r) => data.value!.by_replaced_device[r.name]?.[i] ?? 0),
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
            {{ sumOf(data.by_action[a]) }}
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

      <!-- Which makes fail most, ranked, with a monthly breakdown chart —
           the reason replacements record what came out, not just what went in. -->
      <div v-if="faultyTotal > 0" class="panel mb-6">
        <h3 class="display mb-1 text-xl">Most-replaced devices</h3>
        <p class="mb-3 text-sm text-muted">
          Which makes came out on a replacement job — the higher this is for a
          make, the more often it's failing in the field.
        </p>
        <ol class="mb-4 space-y-1 text-sm">
          <li
            v-for="(r, i) in faultyRanked"
            :key="r.name"
            class="flex items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
          >
            <span><span class="mono text-muted">{{ i + 1 }}.</span> {{ r.name }}</span>
            <span class="mono font-medium">{{ r.total }}</span>
          </li>
        </ol>
        <TrendChart :labels="monthLabels" :series="faultySeries" />
      </div>

      <div class="panel">
        <h3 class="display mb-3 text-xl">By month</h3>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Month</th>
                <th class="num">Total</th>
                <th v-for="name in deviceNames" :key="name" class="num">{{ name }}</th>
                <th v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ INSTALLATION_ACTION_LABELS[a] }}
                </th>
                <th v-for="r in faultyRanked" :key="r.name" class="num">
                  Replaced: {{ r.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, i) in data.months" :key="m">
                <td class="mono">{{ monthLabels[i] }}</td>
                <td class="num">{{ data.total[i] ?? 0 }}</td>
                <td v-for="name in deviceNames" :key="name" class="num">
                  {{ data.by_device[name]?.[i] ?? 0 }}
                </td>
                <td v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ data.by_action[a]?.[i] ?? 0 }}
                </td>
                <td v-for="r in faultyRanked" :key="r.name" class="num">
                  {{ data.by_replaced_device[r.name]?.[i] ?? 0 }}
                </td>
              </tr>
              <tr class="font-medium" style="border-top: 2px solid var(--color-ink)">
                <td>Total</td>
                <td class="num">{{ yearTotal }}</td>
                <td v-for="name in deviceNames" :key="name" class="num">
                  {{ sumOf(data.by_device[name]) }}
                </td>
                <td v-for="a in INSTALLATION_ACTIONS" :key="a" class="num">
                  {{ sumOf(data.by_action[a]) }}
                </td>
                <td v-for="r in faultyRanked" :key="r.name" class="num">{{ r.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
