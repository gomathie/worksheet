<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import MonthPicker from '../components/MonthPicker.vue'

interface AuditRow {
  id: string
  action: string
  target_id: string | null
  meta: string | null
  created_at: string
  actor_name: string | null
}

const auth = useAuthStore()
const month = ref(auth.user!.today.slice(0, 7))
const rows = ref<AuditRow[]>([])
const error = ref('')

async function load() {
  error.value = ''
  try {
    rows.value = await api<AuditRow[]>(`/api/audit?month=${month.value}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load activity'
  }
}
onMounted(load)
watch(month, load)

// e.g. "create_entry" -> "Create entry"
function actionLabel(action: string): string {
  const s = action.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function metaSummary(meta: string | null): string {
  if (!meta) return ''
  try {
    const obj = JSON.parse(meta) as Record<string, unknown>
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ')
  } catch {
    return meta
  }
}
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 class="display text-2xl">Activity</h2>
      <MonthPicker v-model="month" />
    </div>

    <p v-if="error" class="panel mb-6 border-red bg-red-soft text-red">{{ error }}</p>

    <div class="panel">
      <p class="mb-4 text-sm text-muted">
        Every change made in the app — entries, employees, rates, payments —
        with who did it and when (UTC). Latest 500 for the selected month.
      </p>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td class="mono whitespace-nowrap text-[13px]">{{ r.created_at }}</td>
              <td>{{ r.actor_name ?? 'Unknown' }}</td>
              <td>{{ actionLabel(r.action) }}</td>
              <td class="mono max-w-md truncate text-xs text-muted" :title="metaSummary(r.meta)">
                {{ metaSummary(r.meta) }}
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="4" class="py-6 text-center text-muted">
                No activity recorded for this month.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
