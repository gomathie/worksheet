<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { deferredPrompt, installed, installing, isIos, promptInstall } from '../pwaInstall'

// `block`: the full-width profile-panel variant. It also shows when the
// browser offers no install prompt, falling back to manual steps.
const props = defineProps<{ block?: boolean }>()

const installButton = ref<HTMLButtonElement | null>(null)
const closeHelpButton = ref<HTMLButtonElement | null>(null)
const showHelp = ref(false)

const visible = computed(
  () => !installed.value && (props.block || deferredPrompt.value !== null || isIos),
)

async function install() {
  if (await promptInstall()) return
  showHelp.value = true
  await nextTick()
  closeHelpButton.value?.focus()
}

function closeHelp() {
  showHelp.value = false
  nextTick(() => installButton.value?.focus())
}
</script>

<template>
  <div v-if="visible" class="relative">
    <button
      ref="installButton"
      type="button"
      class="btn btn-sm"
      :class="props.block ? 'btn-solid w-full justify-center' : ''"
      :disabled="installing"
      aria-label="Install OpenSignal Ledger app"
      @click="install"
    >
      {{ installing ? 'Opening install…' : isIos ? 'Add to Home Screen' : 'Install app' }}
    </button>

    <div
      v-if="showHelp"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-help-title"
    >
      <div class="panel w-full max-w-md">
        <h2 id="install-help-title" class="display mb-2 text-xl text-teal">
          Add Ledger to your Home Screen
        </h2>
        <template v-if="isIos">
          <p class="mb-3 text-sm text-muted">
            On iPhone or iPad, Safari controls installation. Use these steps:
          </p>
          <ol class="mb-4 list-decimal space-y-2 pl-5 text-sm">
            <li>Tap the Share button in Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> to finish.</li>
          </ol>
        </template>
        <template v-else>
          <p class="mb-3 text-sm text-muted">
            This browser didn't offer a one-tap install. Use its menu instead:
          </p>
          <ol class="mb-4 list-decimal space-y-2 pl-5 text-sm">
            <li>Open the browser menu (<strong>⋮</strong> in Chrome).</li>
            <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
            <li>Confirm to finish.</li>
          </ol>
        </template>
        <button ref="closeHelpButton" type="button" class="btn btn-solid" @click="closeHelp">
          Done
        </button>
      </div>
    </div>
  </div>
</template>
