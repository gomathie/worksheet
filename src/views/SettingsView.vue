<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { RateSettings, WorkTypeInfo } from '../types'

const form = ref<RateSettings>({ point_value: 1, currency: '$', max_entries_per_day: 0 })
const workTypes = ref<WorkTypeInfo[]>([])
const newType = ref({ name: '', points_per_unit: 1 })
const error = ref('')
const saved = ref(false)
const busy = ref(false)

async function loadTypes() {
  workTypes.value = await api<WorkTypeInfo[]>('/api/work-types')
}

onMounted(async () => {
  ;[form.value] = await Promise.all([api<RateSettings>('/api/settings'), loadTypes()])
})

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  busy.value = true
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

function saveSettings() {
  saved.value = false
  return run(async () => {
    form.value = await api<RateSettings>('/api/settings', {
      method: 'PUT',
      json: form.value,
    })
    saved.value = true
  })
}

function addType() {
  return run(async () => {
    await api('/api/work-types', { method: 'POST', json: newType.value })
    newType.value = { name: '', points_per_unit: 1 }
    await loadTypes()
  })
}

function saveType(wt: WorkTypeInfo) {
  return run(async () => {
    await api(`/api/work-types/${wt.id}`, {
      method: 'PATCH',
      json: { name: wt.name, points_per_unit: wt.points_per_unit },
    })
    await loadTypes()
  })
}

function toggleType(wt: WorkTypeInfo) {
  return run(async () => {
    await api(`/api/work-types/${wt.id}`, {
      method: 'PATCH',
      json: { active: wt.active ? 0 : 1 },
    })
    await loadTypes()
  })
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Work types &amp; points</h2>
      <p class="mb-5 text-sm text-muted">
        Each work type is worth points per unit. Assign types to employees in the
        Employees tab — employees can only log the types assigned to them.
        Changing a rate recalculates every past and future figure.
      </p>

      <div class="table-wrap mb-5">
        <table class="data">
          <thead>
            <tr>
              <th>Name</th>
              <th class="num">Points per unit</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="wt in workTypes" :key="wt.id" :class="{ 'opacity-50': !wt.active }">
              <td>
                <input v-model="wt.name" class="field-input !w-44" />
              </td>
              <td class="num">
                <input
                  v-model.number="wt.points_per_unit"
                  type="number"
                  min="0"
                  step="any"
                  class="field-input mono !w-24 text-right"
                />
              </td>
              <td>{{ wt.active ? 'Active' : 'Inactive' }}</td>
              <td class="whitespace-nowrap">
                <button class="btn btn-sm mr-1" :disabled="busy" @click="saveType(wt)">
                  Save
                </button>
                <button
                  class="btn btn-sm"
                  :class="wt.active ? 'btn-danger' : ''"
                  :disabled="busy"
                  @click="toggleType(wt)"
                >
                  {{ wt.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="flex flex-wrap items-end gap-3" @submit.prevent="addType">
        <div>
          <label class="field-label" for="nt-name">New work type</label>
          <input
            id="nt-name"
            v-model="newType.name"
            required
            maxlength="60"
            class="field-input"
            placeholder="e.g. Graphic design"
          />
        </div>
        <div>
          <label class="field-label" for="nt-rate">Points per unit</label>
          <input
            id="nt-rate"
            v-model.number="newType.points_per_unit"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono !w-28"
          />
        </div>
        <button class="btn btn-solid" :disabled="busy">Add work type</button>
      </form>
    </div>

    <div class="panel">
      <h2 class="display mb-1 text-2xl">Money &amp; currency</h2>
      <p class="mb-5 text-sm text-muted">
        Remuneration = points × value per point, plus bonuses and approved
        reimbursements.
      </p>
      <form class="grid grid-cols-2 gap-4" @submit.prevent="saveSettings">
        <div>
          <label class="field-label" for="pv">Value per point</label>
          <input
            id="pv"
            v-model.number="form.point_value"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="cur">Currency symbol</label>
          <input
            id="cur"
            v-model="form.currency"
            maxlength="4"
            required
            class="field-input mono"
          />
        </div>
        <div class="col-span-2">
          <label class="field-label" for="maxpd">Max entries per employee per day (0 = unlimited)</label>
          <input
            id="maxpd"
            v-model.number="form.max_entries_per_day"
            type="number"
            min="0"
            step="1"
            required
            class="field-input mono"
          />
          <p class="mt-1 text-xs text-muted">
            The default cap on how many times an employee can log per day. Set a
            per-person override in the Employees tab. Admins are never capped.
          </p>
        </div>
        <div class="col-span-2">
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save settings' }}
          </button>
          <span v-if="saved" class="ml-3 text-sm text-teal">Saved.</span>
        </div>
      </form>
    </div>

    <p v-if="error" class="rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
      {{ error }}
    </p>
  </div>
</template>
