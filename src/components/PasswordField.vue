<script setup lang="ts">
import { ref } from 'vue'

// A password-type input with a Show/Hide toggle. The toggle only reveals
// whatever is currently typed into the field — the API never returns a
// stored secret (SMTP password, mnotify API key), so there's nothing to
// preview but what the user just entered here.
defineProps<{
  id: string
  placeholder?: string
  autocomplete?: string
  required?: boolean
}>()
const modelValue = defineModel<string>({ default: '' })

const visible = ref(false)
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      v-model="modelValue"
      :type="visible ? 'text' : 'password'"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      class="field-input pr-14"
    />
    <button
      type="button"
      class="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-medium tracking-wide text-muted uppercase hover:text-ink"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      tabindex="-1"
      @click="visible = !visible"
    >
      {{ visible ? 'Hide' : 'Show' }}
    </button>
  </div>
</template>
