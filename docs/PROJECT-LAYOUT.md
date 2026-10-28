# Project Layout

| Path | Responsibility |
|---|---|
| `src/` | Vue 3 application, routes, stores, views, reusable components, styles, and browser helpers. |
| `src/views/` | Page-level components named `*View.vue`. |
| `src/components/` | Reusable UI components and visual helpers. |
| `src/stores/` | Pinia stores; currently the authenticated session and rights store. |
| `src/router/` | Lazy-loaded routes and client-side auth/right/role guards. |
| `server/` | Server-side domain modules, authentication, authorization, scope filtering, notifications, and HTTP helpers. |
| `functions/api/[[route]].ts` | Cloudflare Pages Function route dispatcher. Keep domain logic in `server/`. |
| `functions/_middleware.ts` | Pages Function middleware, including optional Sentry instrumentation. |
| `shared/` | Pure TypeScript logic and vocabulary shared by browser and server code. |
| `migrations/` | Forward-only D1 SQLite SQL migrations. |
| `tests/` | Vitest tests, primarily for shared logic and server-safe pure helpers. |
| `public/` | PWA manifest, icons, service worker, and other static assets. |
| `scripts/` | Local maintenance and seed helpers. |
| `docs/` | Architecture, local setup, testing, security, database, tooling, and handoff documentation. |
| `.agents/skills/` | Project-local agent skills pinned by `skills-lock.json`. |
| `dist/`, `.wrangler/`, `node_modules/` | Generated or installed local artifacts; do not edit or commit them. |
| `scratch/`, `mobile-shots/` | Temporary investigation or visual-verification artifacts; keep task-specific and non-secret. |

## Request flow

```text
Vue view/component
  -> src/api.ts
  -> functions/api/[[route]].ts
  -> server/<domain>.ts
  -> Cloudflare D1 / KV / optional services
```

The server resolves the session and authorization before returning protected records or aggregates. Vue route guards and computed visibility are not security boundaries.
