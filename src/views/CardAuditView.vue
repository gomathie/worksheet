<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { downloadCsv } from '../csv'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'
import type { CardAuditGroup } from '../../shared/logic'

// Who classified or QAP'd a given card. A card belongs to an entry and the
// entry names whose work it was, so this is a lookup over what is already
// recorded rather than a new kind of record.

const auth = useAuthStore()

const q = ref('')
const month = ref('')
const allMonths = ref(true)
const groups = ref<CardAuditGroup[]>([])
const error = ref('')
const loading = ref(false)

async function load() {
  error.value = ''
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (q.value.trim()) params.set('q', q.value.trim())
    if (!allMonths.value && month.value) params.set('month', month.value)
    groups.value = await api<CardAuditGroup[]>(`/api/card-audit?${params}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the card audit'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  month.value = auth.user!.today.slice(0, 7)
  load()
})
watch([month, allMonths], load)

const repeated = computed(() => groups.value.filter((g) => g.repeats.length > 0))
const totalRows = computed(() => groups.value.reduce((n, g) => n + g.rows.length, 0))

function exportCsv() {
  const rows: (string | number)[][] = [
    ['Card', 'Work type', 'Who', 'Date', 'Total audits', 'Time completed', 'Repeat'],
  ]
  for (const g of groups.value) {
    for (const r of g.rows) {
      rows.push([
        g.card_name,
        r.work_type_name,
        r.employee_name,
        r.work_date,
        r.total_audits,
        r.time_completed ?? '',
        g.repeats.some((x) => x.work_type_name === r.work_type_name) ? 'yes' : '',
      ])
    }
  }
  downloadCsv(`card-audit-${new Date().toISOString().slice(0, 10)}.csv`, rows)
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Card audit</h2>
      <button class="btn btn-sm" :disabled="totalRows === 0" @click="exportCsv">
        Download CSV
      </button>
    </div>

    <p class="mb-4 text-sm text-muted">
      Who classified or QAP'd a card, and when. A card is normally classified
      once and QAP'd once — anything logged twice is flagged so you can tell
      rework from two people doing the same card.
    </p>

    <div class="panel mb-6">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[2fr_auto]">
        <div>
          <label class="field-label" for="ca-q">Card name</label>
          <input
            id="ca-q"
            v-model="q"
            class="field-input"
            placeholder="e.g. Alza_cz — leave blank for all"
            @keyup.enter="load"
          />
        </div>
        <div class="flex items-end">
          <button class="btn btn-solid" :disabled="loading" @click="load">
            {{ loading ? 'Searching…' : 'Search' }}
          </button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="allMonths" type="checkbox" />
          Every month
        </label>
        <MonthPicker v-if="!allMonths" v-model="month" />
      </div>
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div v-if="!loading" class="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
      <div class="panel">
        <p class="field-label">Cards</p>
        <p class="stat-figure">{{ groups.length }}</p>
      </div>
      <div class="panel">
        <p class="field-label">Times logged</p>
        <p class="stat-figure">{{ totalRows }}</p>
      </div>
      <div class="panel col-span-2 md:col-span-1">
        <p class="field-label">Logged more than once</p>
        <p class="stat-figure" :class="repeated.length ? 'text-amber' : 'text-teal'">
          {{ repeated.length }}
        </p>
      </div>
    </div>

    <p v-if="!loading && groups.length === 0" class="panel text-muted">
      No cards match. Card names are case-sensitive on the part you type.
    </p>

    <div v-for="g in groups" :key="g.card_name" class="panel mb-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 class="display text-xl">{{ g.card_name }}</h3>
        <span
          v-for="r in g.repeats"
          :key="r.work_type_name"
          class="display rounded-full border border-amber px-2 py-0.5 text-xs tracking-wider text-amber"
        >
          {{ r.work_type_name }} ×{{ r.times }}
          {{ r.people.length > 1 ? `— ${r.people.join(' & ')}` : '— same person' }}
        </span>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>Work type</th>
              <th>Who</th>
              <th>Date</th>
              <th class="num">Total audits</th>
              <th>Time completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in g.rows" :key="`${r.entry_id}-${i}`">
              <td>{{ r.work_type_name }}</td>
              <td>{{ r.employee_name }}</td>
              <td class="mono whitespace-nowrap">{{ r.work_date }}</td>
              <td class="num">{{ r.total_audits }}</td>
              <td class="mono text-xs">{{ r.time_completed ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
