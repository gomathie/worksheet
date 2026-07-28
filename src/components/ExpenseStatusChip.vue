<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_LABELS, type ExpenseStatus } from '../../shared/expenses'

const props = defineProps<{ status: ExpenseStatus }>()

// Teal = settled well, amber = waiting on somebody, red = refused,
// plain = not yet in play. Matches the palette used across the app.
const TONE: Record<ExpenseStatus, string> = {
  draft: 'border-line text-muted',
  submitted: 'border-amber text-amber',
  manager_review: 'border-amber text-amber',
  finance_review: 'border-amber text-amber',
  approved: 'border-teal text-teal',
  rejected: 'border-red text-red',
  paid: 'border-teal bg-teal-soft text-teal',
}

const label = computed(() => STATUS_LABELS[props.status] ?? props.status)
const tone = computed(() => TONE[props.status] ?? 'border-line text-muted')
</script>

<template>
  <span
    class="display inline-block rounded-full border px-2 py-0.5 text-xs tracking-wider whitespace-nowrap"
    :class="tone"
  >
    {{ label }}
  </span>
</template>
