<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(
  defineProps<{
    label?: string
  }>(),
  { label: 'Actions' },
)

const root = ref<HTMLElement | null>(null)
const open = ref(false)

function close() {
  open.value = false
}

function handleDocumentPointer(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close()
}

function handleDocumentKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function handleAction(event: MouseEvent) {
  const control = event.target instanceof Element ? event.target.closest('button, a') : null
  if (!control || (control instanceof HTMLButtonElement && control.disabled)) return
  requestAnimationFrame(close)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointer)
  document.addEventListener('keydown', handleDocumentKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointer)
  document.removeEventListener('keydown', handleDocumentKey)
})
</script>

<template>
  <div ref="root" class="mobile-action-menu">
    <button
      type="button"
      class="btn btn-sm mobile-action-menu__trigger"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span aria-hidden="true" class="text-lg leading-none">&#8942;</span>
      <span>{{ label }}</span>
    </button>
    <div
      class="mobile-action-menu__content"
      :class="{ 'mobile-action-menu__content--open': open }"
      @click="handleAction"
    >
      <slot />
    </div>
  </div>
</template>
