<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import TrendChart from '../components/TrendChart.vue'
import type { Employee, TrendData } from '../types'

const auth = useAuthStore()
const error = ref('')
const data = ref<TrendData | null>(null)

const employees = ref<Employee[]>([])
const selectedId = ref(auth.user!.id)
const range = ref(6)

async function load() {
  error.value = ''
  try {
    const params = new URLSearchParams({ months: String(range.value) })
    if (auth.isAdmin) params.set('employee_id', selectedId.value)
    data.value = await api<TrendData>(`/api/trends?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load trends'
  }
}

onMounted(async () => {
  if (auth.isAdmin) {
    employees.value = (await api<Employee[]>('/api/employees')).filter((e) => e.active)
  }
  await load()
})
watch([selectedId, range], load)

// "2026-07" -> "Jul 26"
const monthLabels = computed(() =>
  (data.value?.months ?? []).map((m) => {
    const [y, mo] = m.split('-').map(Number)
    const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    return `${name} ${String(y).slice(2)}`
  }),
)

const unitSeries = computed(() =>
  (data.value?.work_types ?? []).map((wt) => ({
    label: wt.name,
    data: data.value!.units[wt.id] ?? [],
  })),
)

const hasUnits = computed(() =>
  unitSeries.value.some((s) => s.data.some((n) => n > 0)),
)
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Trends</h2>
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-if="auth.isAdmin"
          v-model="selectedId"
          class="field-input !w-auto"
          aria-label="Employee"
        >
          <option v-for="e in employees" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
        <select v-model.number="range" class="field-input !w-auto" aria-label="Range">
          <option :value="3">Last 3 months</option>
          <option :value="6">Last 6 months</option>
          <option :value="12">Last 12 months</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <template v-if="data">
      <p class="mb-4 text-sm text-muted">
        Performance for
        <span class="display text-base text-ink">{{ data.employee_name }}</span>
        over the last {{ range }} months.
      </p>

      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Work output by month</h3>
        <TrendChart v-if="hasUnits" :labels="monthLabels" :series="unitSeries" />
        <p v-else class="py-6 text-center text-muted">
          No countable work logged in this period.
        </p>
      </div>

      <div class="panel mb-6">
        <h3 class="display mb-3 text-xl">Hours by month</h3>
        <TrendChart :labels="monthLabels" :series="[{ label: 'Hours', data: data.hours }]" />
      </div>

      <div v-if="data.show_money && data.remuneration" class="panel mb-6">
        <h3 class="display mb-3 text-xl">Remuneration by month</h3>
        <TrendChart
          :labels="monthLabels"
          :series="[{ label: 'Remuneration', data: data.remuneration }]"
          :currency="data.currency"
        />
      </div>

      <div v-if="data.show_points && data.points" class="panel">
        <h3 class="display mb-3 text-xl">Points by month</h3>
        <TrendChart
          :labels="monthLabels"
          :series="[{ label: 'Points', data: data.points }]"
        />
      </div>
    </template>
  </div>
</template>
