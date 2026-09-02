/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN for browser error/performance monitoring. Unset = disabled. */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, unknown>
  export default component
}
