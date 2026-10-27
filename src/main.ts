import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import { isRouteChunkLoadError, recoverRouteChunkLoad } from './router/chunkRecovery'
import './style.css'

// Vue Router reports lazy-route import failures through its own error hook,
// but browsers also surface the same failed import as an unhandled promise
// rejection. Recover the latter too and suppress it after the one-time reload
// has been scheduled; otherwise monitoring still records a user-visible error
// even though the fresh app shell can load the route successfully.
if (import.meta.env.PROD) {
  const currentRouteTarget = () =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`

  const recoverFromBrowserError = (reason: unknown) => {
    if (!isRouteChunkLoadError(reason)) return false

    recoverRouteChunkLoad(
      reason,
      currentRouteTarget(),
      window.sessionStorage,
      () => window.location.reload(),
    )
    return true
  }

  window.addEventListener('unhandledrejection', (event) => {
    if (recoverFromBrowserError(event.reason)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  })

  window.addEventListener('error', (event) => {
    if (recoverFromBrowserError(event.error ?? event.message)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  })
}

const app = createApp(App)

// Error/performance monitoring. Off unless a DSN is configured (local dev
// has none by default) and only in production builds — no point spending the
// quota on dev noise. Set VITE_SENTRY_DSN in the build environment to enable.
const dsn = import.meta.env.VITE_SENTRY_DSN
if (import.meta.env.PROD && dsn) {
  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration({ router })],
    // Light sampling: this is an internal team tool, not high-traffic —
    // enough to catch real problems without burning through the quota.
    tracesSampleRate: 0.2,
  })
}

app.use(createPinia()).use(router).mount('#app')

// Register the service worker for offline/instant loads and installability.
// Dev runs over http on localhost (allowed); the SW is a no-op there anyway.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: the app works fine without the service worker.
    })
  })
}

// Automatically inject data-labels onto data tables for responsive mobile cards
// and make only genuinely overflowing table regions keyboard-scrollable.
const observeTables = () => {
  document.querySelectorAll('table.data').forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent?.trim() || '')
    table.querySelectorAll('tbody tr').forEach(tr => {
      // Don't apply to total or group head rows
      if (tr.classList.contains('totals') || tr.classList.contains('group-head')) return
      
      tr.querySelectorAll('td').forEach((td, i) => {
        if (headers[i] && !td.hasAttribute('data-label')) {
          td.setAttribute('data-label', headers[i])
        }
      })
    })
  })

  document.querySelectorAll<HTMLElement>('.table-wrap').forEach(wrapper => {
    const overflowing = wrapper.scrollWidth > wrapper.clientWidth + 1
    wrapper.dataset.overflowing = String(overflowing)

    if (overflowing) {
      if (!wrapper.hasAttribute('tabindex')) {
        wrapper.tabIndex = 0
        wrapper.dataset.autoTableTabIndex = 'true'
      }
      if (!wrapper.hasAttribute('role')) {
        wrapper.setAttribute('role', 'region')
        wrapper.dataset.autoTableRole = 'true'
      }
      if (!wrapper.hasAttribute('aria-label')) {
        const heading = wrapper.closest('.panel')?.querySelector('h2, h3')
        wrapper.setAttribute(
          'aria-label',
          heading?.textContent?.trim() || 'Scrollable data table',
        )
        wrapper.dataset.autoTableLabel = 'true'
      }
      wrapper.dataset.autoTableRegion = 'true'
    } else if (wrapper.dataset.autoTableRegion === 'true') {
      if (wrapper.dataset.autoTableTabIndex === 'true') {
        wrapper.removeAttribute('tabindex')
        delete wrapper.dataset.autoTableTabIndex
      }
      if (wrapper.dataset.autoTableRole === 'true') {
        wrapper.removeAttribute('role')
        delete wrapper.dataset.autoTableRole
      }
      if (wrapper.dataset.autoTableLabel === 'true') {
        wrapper.removeAttribute('aria-label')
        delete wrapper.dataset.autoTableLabel
      }
      delete wrapper.dataset.autoTableRegion
    }
  })
}

// Observe DOM for new tables being rendered
const observer = new MutationObserver(observeTables)
observer.observe(document.body, { childList: true, subtree: true })
// And run once immediately
observeTables()
window.addEventListener('resize', observeTables)
