// Browser-side Web Push subscription.
//
// The server sends payload-less pushes; the service worker fetches the detail
// itself (see public/sw.js). All this module does is negotiate permission and
// hand the resulting endpoint to the API.

import { api } from './api'

/** base64url VAPID key -> the Uint8Array PushManager wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * iOS only exposes push to an installed PWA, so a Safari user who has not
 * added the app to their home screen will find the button does nothing useful.
 * Detect that up front so the UI can say so instead.
 */
export function needsInstallForPush(): boolean {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return iOS && !standalone
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported'
}

/** Is this device already subscribed? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * Ask for permission and register with the push service. Must be called from
 * a user gesture — browsers reject a permission prompt raised any other way.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'This browser cannot do push notifications.' }
  if (needsInstallForPush()) {
    return {
      ok: false,
      reason:
        'On iPhone, add Ledger to your Home Screen first — iOS only allows notifications for installed apps.',
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission was not granted.' }
  }

  const reg = await navigator.serviceWorker.ready
  const { key } = await api<{ key: string }>('/api/push/key')

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      // Required by Chrome, and the right behaviour anyway: every push we
      // send results in a visible notification.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    })
  }

  await api('/api/push/subscribe', { method: 'POST', json: { endpoint: sub.endpoint } })
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/api/push/unsubscribe', {
    method: 'POST',
    json: { endpoint: sub.endpoint },
  }).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}
