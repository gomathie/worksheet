# Architecture Overview

## Runtime

The application is a Vite-built Vue 3 single-page app deployed to Cloudflare Pages. Pages Functions provide the `/api/*` backend. D1 stores relational application data, Workers KV stores sessions, and optional Sentry integrations monitor frontend and backend errors.

## Frontend

- `src/main.ts` creates the Vue app, installs Pinia and Vue Router, initializes optional Sentry, registers the service worker, and observes responsive tables.
- `src/App.vue` owns the authenticated shell, navigation, account actions, and global alerts.
- `src/router/index.ts` lazy-loads views and applies client-side auth, role, and right redirects.
- `src/stores/auth.ts` owns the current `/api/me` session, role, rights, and impersonation state.
- `src/api.ts` is the single fetch wrapper. It serializes JSON, normalizes API errors, and redirects expired sessions through `auth:unauthorized`.
- `src/style.css` contains Tailwind imports, project color tokens, shared controls, panels, tables, responsive behavior, focus styles, and reduced-motion rules.

## Backend

`functions/api/[[route]].ts` is the request entrypoint and delegates domain behavior to modules in `server/`. `server/auth.ts` handles session/user rights, `server/scope.ts` calculates visible employee records, and domain modules handle tasks, expenses, news, leaves, deductions, notifications, and settings.

Use prepared D1 statements and the typed bindings in `server/env.ts`. Keep pure calculations and state machines in `shared/` so they can be tested without a browser or Cloudflare runtime.

## Authorization model

Authentication is session-based. Roles are `admin`, `manager`, and `employee`; rights are stored per employee. `data_scope` controls which employees' records a viewer may see, while assigned work types control which work categories and aggregates a standard user may access. Admin behavior is intentionally broader where the existing authorization model permits it.

Every protected endpoint must enforce these rules server-side before data reaches the browser. UI route guards and hidden controls improve usability but cannot replace API enforcement.

## Data and deployment

Schema changes are plain SQL files in `migrations/` and are applied by Wrangler. `wrangler.toml` declares production and preview D1/KV bindings, the `TEAM_TZ` variable, Pages output, and `nodejs_compat`. Production migration and deployment commands are intentionally separate from normal test/build checks.
