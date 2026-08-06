<script setup lang="ts">
import { ref } from 'vue'

// A single top-level nav pill that expands into a small dropdown of related
// destinations. Mirrors the Account menu's dropdown pattern (fixed backdrop +
// absolute panel) so grouped items behave identically on mobile and desktop
// instead of needing separate collapse logic.
defineProps<{ label: string; active?: boolean }>()

const open = ref(false)
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="btn flex w-full items-center justify-between gap-1.5 md:w-auto"
      :class="{ 'btn-solid': active }"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <span>{{ label }}</span>
      <span class="text-xs" :class="active ? '' : 'text-muted'">{{
        open ? '▴' : '▾'
      }}</span>
    </button>

    <!-- click-away backdrop -->
    <div v-if="open" class="fixed inset-0 z-10" @click="open = false" />

    <div
      v-if="open"
      class="panel absolute left-0 z-20 mt-1 w-48 !p-1 text-sm shadow-lg"
      @click="open = false"
    >
      <slot />
    </div>
  </div>
</template>
