<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const installButton = ref<HTMLButtonElement | null>(null)
const closeHelpButton = ref<HTMLButtonElement | null>(null)
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
const installing = ref(false)
const showIosHelp = ref(false)
const isIos = ref(false)

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function detectIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
}

function handleInstalled() {
  installed.value = true
  deferredPrompt.value = null
  showIosHelp.value = false
}

async function install() {
  if (installing.value) return

  if (!deferredPrompt.value) {
    if (isIos.value) {
      showIosHelp.value = true
      await nextTick()
      closeHelpButton.value?.focus()
    }
    return
  }

  installing.value = true
  try {
    const prompt = deferredPrompt.value
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') installed.value = true
  } catch {
    // The browser owns the native prompt; a dismissal or unavailable prompt
    // should never make the rest of the app fail.
  } finally {
    deferredPrompt.value = null
    installing.value = false
  }
}

function closeHelp() {
  showIosHelp.value = false
  nextTick(() => installButton.value?.focus())
}

onMounted(() => {
  isIos.value = detectIos()
  installed.value = isStandalone()
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleInstalled)
})
</script>

<template>
  <div v-if="!installed && (deferredPrompt || isIos)" class="relative">
    <button
      ref="installButton"
      type="button"
      class="btn btn-sm"
      :disabled="installing"
      aria-label="Install OpenSignal Ledger app"
      @click="install"
    >
      {{ installing ? 'Opening install…' : isIos ? 'Add to Home Screen' : 'Install app' }}
    </button>

    <div
      v-if="showIosHelp"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
    >
      <div class="panel w-full max-w-md">
        <h2 id="ios-install-title" class="display mb-2 text-xl text-teal">
          Add Ledger to your Home Screen
        </h2>
        <p class="mb-3 text-sm text-muted">
          On iPhone or iPad, Safari controls installation. Use these steps:
        </p>
        <ol class="mb-4 list-decimal space-y-2 pl-5 text-sm">
          <li>Tap the Share button in Safari.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong> to finish.</li>
        </ol>
        <button
          ref="closeHelpButton"
          type="button"
          class="btn btn-solid"
          autofocus
          @click="closeHelp"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
