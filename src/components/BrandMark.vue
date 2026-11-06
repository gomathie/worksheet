<script setup lang="ts">
import { isFestiveSeason } from '../../shared/season'

// Evaluated once per page load; nobody keeps a tab open across 10 January
// expecting the hat to vanish mid-session.
const festive = isFestiveSeason(new Date())

const confetti = [
  { left: '-10px', top: '2px', color: 'var(--color-red)', shape: 'rounded-full', delay: '0s' },
  { left: '44px', top: '-2px', color: 'var(--color-teal)', shape: 'rotate-45', delay: '0.4s' },
  { left: '-6px', top: '30px', color: 'var(--color-amber)', shape: 'rotate-12', delay: '0.8s' },
  { left: '46px', top: '28px', color: 'var(--color-red)', shape: 'rotate-45', delay: '1.2s' },
  { left: '20px', top: '44px', color: 'var(--color-teal)', shape: 'rounded-full', delay: '1.6s' },
]
</script>

<template>
  <div class="relative h-10 w-10 shrink-0">
    <div
      class="display flex h-10 w-10 -rotate-6 items-center justify-center rounded-full border-2 border-ink text-[15px]"
    >
      LG
    </div>

    <template v-if="festive">
      <svg
        class="pointer-events-none absolute -top-4 -right-3 h-7 w-8 rotate-[18deg]"
        viewBox="0 0 32 28"
        aria-hidden="true"
      >
        <path d="M3 22 C6 10 14 3 24 4 C21 9 20 15 21 22 Z" fill="var(--color-red)" />
        <rect x="1" y="20" width="23" height="6" rx="3" fill="#fff" stroke="var(--color-line)" />
        <circle cx="26" cy="5" r="4" fill="#fff" stroke="var(--color-line)" />
      </svg>
      <span
        v-for="(c, i) in confetti"
        :key="i"
        class="festive-confetti pointer-events-none absolute h-1.5 w-1.5"
        :class="c.shape"
        :style="{ left: c.left, top: c.top, background: c.color, animationDelay: c.delay }"
        aria-hidden="true"
      />
    </template>
  </div>
</template>

<style scoped>
.festive-confetti {
  animation: festive-twinkle 2.4s ease-in-out infinite;
}

@keyframes festive-twinkle {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>
