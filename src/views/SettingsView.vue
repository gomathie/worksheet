<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { RateSettings } from '../types'

const form = ref<RateSettings>({
  points_per_classification: 1,
  points_per_qap: 1,
  point_value: 1,
  currency: '$',
})
const error = ref('')
const saved = ref(false)
const busy = ref(false)

onMounted(async () => {
  form.value = await api<RateSettings>('/api/settings')
})

async function save() {
  error.value = ''
  saved.value = false
  busy.value = true
  try {
    form.value = await api<RateSettings>('/api/settings', {
      method: 'PUT',
      json: form.value,
    })
    saved.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save settings'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-xl">
    <div class="panel">
      <h2 class="display mb-1 text-2xl">Rates &amp; currency</h2>
      <p class="mb-5 text-sm text-muted">
        These rates drive every points and remuneration figure on the dashboard and
        reports.
      </p>
      <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
        <div>
          <label class="field-label" for="ppc">Points per classification</label>
          <input
            id="ppc"
            v-model.number="form.points_per_classification"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono"
          />
        </div>
        <div>
          <label class="field-label" for="ppq">Points per QAP</label>
          <input
            id="ppq"
            v-model.number="form.points_per_qap"
            type="number"
            min="0"
            step="any"
            required
            class="field-input mono"
          />
        </div>
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
          <button class="btn btn-solid" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save settings' }}
          </button>
          <span v-if="saved" class="ml-3 text-sm text-teal">Saved.</span>
        </div>
      </form>
      <p v-if="error" class="mt-3 rounded-lg border border-red bg-red-soft p-3 text-sm text-red">
        {{ error }}
      </p>
    </div>
  </div>
</template>
