import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import './style.css'

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
