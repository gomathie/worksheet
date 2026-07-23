<script setup lang="ts">
const model = defineModel<string>({ required: true })

function shift(delta: number) {
  const [y, m] = model.value.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  model.value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const label = () => {
  const [y, m] = model.value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button class="btn btn-sm" aria-label="Previous month" @click="shift(-1)">‹</button>
    <span class="display min-w-36 text-center text-xl">{{ label() }}</span>
    <button class="btn btn-sm" aria-label="Next month" @click="shift(1)">›</button>
    <input
      v-model="model"
      type="month"
      class="field-input mono ml-2 !w-auto"
      aria-label="Pick month"
    />
  </div>
</template>
