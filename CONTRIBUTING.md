# Contributing to OpenSignal Ledger

## Before changing code

1. Read `AGENTS.md` and the matching workflow in the shared workflow library.
2. Read the relevant callers, route, server module, shared logic, migration, and tests before editing.
3. Preserve server-side authentication, rights, employee data scopes, work-type scopes, validation, and admin behavior.
4. Keep changes focused; do not add dependencies or change production bindings without explicit scope.

## Project conventions

- Vue pages live in `src/views/*View.vue` and reusable UI lives in `src/components/`.
- Use `<script setup lang="ts">`, Pinia for auth/session state, Vue Router metadata for client navigation guards, and `src/api.ts` for API calls.
- Put domain logic in `server/`, route dispatch in `functions/api/[[route]].ts`, pure shared logic in `shared/`, and SQL in `migrations/`.
- Client-side filtering is a presentation safety layer only. Protected data must be filtered server-side before it is returned or aggregated.

## Validation

Run the focused checks during development:

```bash
npm run typecheck:app
npm run typecheck:server
npm test
npm run build
```

Before handoff, run:

```bash
npm run check
git diff --check
```

For UI changes, verify the existing responsive widths: 320px, 375px, 768px, 1024px, and 1440px.

## Database and deployment safety

- Apply new migrations locally with `npm run db:migrate:local`.
- Inspect `migrations/` before choosing a filename; numeric prefixes are not all unique.
- Do not run `npm run db:migrate:prod`, `npm run deploy`, or push changes without explicit authorization.
- Update `changelog.md` and append a work-log entry to `AGENTS.md` for every requested change.
