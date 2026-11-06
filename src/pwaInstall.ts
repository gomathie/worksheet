import { ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// Shared by every install button. The browser fires beforeinstallprompt once
// per page load, possibly before any component mounts, and the captured event
// can only be prompted once, so it is captured here, at import time.
export const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
export const installing = ref(false)
export const isIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const installed = ref(
  window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
)

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  installed.value = true
  deferredPrompt.value = null
})

/** Opens the native prompt; false means the caller should show manual steps. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt.value
  if (!prompt || installing.value) return false
  installing.value = true
  try {
    await prompt.prompt()
    if ((await prompt.userChoice).outcome === 'accepted') installed.value = true
  } catch {
    // The browser owns the prompt; a dismissal must never break the app.
  } finally {
    deferredPrompt.value = null
    installing.value = false
  }
  return true
}
