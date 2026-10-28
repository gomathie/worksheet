# Testing and Validation

## Automated checks

```bash
npm run typecheck:app       # Vue/browser TypeScript
npm run typecheck:server    # Pages Functions/server TypeScript
npm test                    # Vitest unit suite
npm run test:watch          # Vitest watch mode
npm run build               # vue-tsc build plus Vite production build
npm run check               # all checks above in one command
git diff --check            # whitespace/error check
```

The baseline suite covers shared calculations, task/expense/news state machines, rights, dates, sanitization, routing, and other pure helpers. Add regression tests beside the relevant existing test file when behavior changes.

## Browser verification

Playwright is installed for local smoke checks, but there is no committed Playwright test script/configuration. Use an existing local harness or a temporary, non-committed script when live browser evidence is needed. The preferred project widths are 320px, 375px, 768px, 1024px, and 1440px.

The repository's browser skill prefers an isolated Chrome DevTools MCP connection for DOM, console, network, accessibility, and performance evidence. That MCP is not currently configured locally, so do not claim DevTools results unless the connection is present.

## What to verify for access-sensitive changes

- API response for an ordinary user.
- API response for a user assigned to the relevant work type.
- API response for a user not assigned to the relevant work type.
- Admin response and UI behavior.
- Aggregates, totals, nested work-type data, and employee data scopes—not only individual rows.
