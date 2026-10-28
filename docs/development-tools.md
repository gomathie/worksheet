# Development Tooling Decisions

Reviewed October 27, 2026 for the OpenSignal Ledger repository.

## Current application baseline

- Frontend: Vue 3 with `<script setup>`, Vite, TypeScript, Vue Router, Pinia, Tailwind CSS 4, Chart.js, and `marked`.
- Backend: Cloudflare Pages Functions with D1 for SQLite data and Workers KV for sessions.
- Security model: username/password sessions, server-side rights, employee data scopes, work-type assignments, and admin-only operations.
- Validation already present: Vitest, strict frontend/server TypeScript configurations, Vite production build, Wrangler local development, Sentry error tracking, and Playwright as a dependency.
- Baseline on this review: `npm.cmd test` passed 12 files/280 tests; `npm.cmd run build` passed. The installed working-tree versions were Node 22.15.0, npm 11.7.0, Vue 3.5.40, Vite 6.4.3, TypeScript 5.9.3, Vitest 3.2.7, Wrangler 4.113.0, and Tailwind CSS 4.3.3.

## Repository onboarding documents

- [`CONTRIBUTING.md`](../CONTRIBUTING.md): change, validation, migration, and deployment-safety rules.
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md): runtime, frontend, backend, authorization, and deployment boundaries.
- [`docs/PROJECT-LAYOUT.md`](PROJECT-LAYOUT.md): folder responsibilities and request flow.
- [`docs/LOCAL-DEVELOPMENT.md`](LOCAL-DEVELOPMENT.md): local setup, ports, D1, admin seed, and troubleshooting.
- [`docs/TESTING.md`](TESTING.md): type checks, Vitest, builds, browser checks, and access-sensitive verification.
- [`docs/AUTHORIZATION.md`](AUTHORIZATION.md): roles, rights, employee scopes, and work-type scopes.
- [`docs/DATABASE.md`](DATABASE.md): migration workflow and remote D1 trigger caveat.

## Security baseline

`npm.cmd audit --omit=dev --audit-level=high` reached the advisory service after a network-enabled retry and reported 10 advisories: 1 moderate, 8 high, and 1 critical. The reported paths include Vue's server renderer, DOMPurify through `html2pdf.js`, PostCSS/source-map-js through Vite/Tailwind, and sharp/undici through the Wrangler/Miniflare toolchain.

No automatic remediation was applied. `npm audit fix` would change the dependency graph and lockfile, and the findings need to be separated into production-reachable versus development-only paths before upgrading. Treat this as a follow-up dependency-security task; do not point Strix at production as a substitute for that review.

## Decision table

| Tool | Decision | Reason | Credentials/cost/data boundary |
|---|---|---|---|
| Agent Skills | **Install** | Three workflows directly fit this Vue app: UI engineering, browser verification, and code review. | MIT-licensed Markdown workflows from `addyosmani/agent-skills`; copied locally. No production dependency or source upload. |
| Context7 | **Skip for now** | Useful for version-specific Vue/Vite/Cloudflare docs, but this Codex session has no connected Context7 MCP and no project need justifies adding credentials or client-global config automatically. | Official server is version 4.0.3; API key is optional for higher limits/private repositories. Queries would leave the machine for documentation retrieval. |
| Graphify | **Skip** | The repository is small enough for `rg`, the existing README, and the new tool record. A persistent graph would add generated artifacts and refresh work without a demonstrated navigation problem. | Official Graphify-Labs project is local-first for code parsing; Apache-2.0/MIT licenses are reported. Semantic processing of non-code content may use an assistant/model. |
| 21st MCP | **Skip** | Its documented component catalog targets React/TypeScript/Tailwind and this app is Vue. Introducing React or copying a second component system would increase maintenance and visual inconsistency. | Search is free; installs are limited on the free plan and AI generation uses credits. Requires sign-in/API key for authenticated use. |
| Strix | **Defer / blocked** | Strix performs active AI-assisted penetration testing. No isolated local target, Docker setup, LLM provider, or written test scope was supplied. | Official `usestrix/strix` project is Apache-2.0, but runs need local sandbox infrastructure and an LLM key. Never point it at production or shared data without explicit authorization. |

## Installed Agent Skills

Installed project-locally from the verified `addyosmani/agent-skills` GitHub repository using the official `npx skills add` fallback because Python was unavailable on this Windows host:

- `.agents/skills/frontend-ui-engineering/SKILL.md`
- `.agents/skills/browser-testing-with-devtools/SKILL.md`
- `.agents/skills/code-review-and-quality/SKILL.md`
- `skills-lock.json` records the source paths and content hashes.

Use them selectively:

```text
UI change: use @frontend-ui-engineering. Preserve the existing teal/ink tokens, verify keyboard states, and test 320px, 768px, 1024px, and 1440px widths.

Browser verification: use @browser-testing-with-devtools for DOM, console, network, accessibility, and performance evidence. It requires a Chrome DevTools MCP connection; Playwright remains the local fallback until that MCP is configured.

Review: use @code-review-and-quality after implementation, with correctness, security, architecture, performance, and verification findings separated by severity.
```

### Shared workflow-library contribution rule

All agents working in this repository must run the library contribution check immediately after invoking any project-local or shared-library skill, and again at the end of the task. Read `C:\Users\gomat\OneDrive\Documents\Workflow and skills\workflows\library-contribution.md`; update the shared library only when the check finds reusable project knowledge, a missing step, or an inaccurate instruction. This rule is also recorded in `AGENTS.md`.

The browser skill's recommended isolated MCP configuration, for a future client that supports project `.mcp.json`, is:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--isolated"]
    }
  }
}
```

This configuration was not added automatically because the current Codex session does not expose that MCP server and the package was not pinned or smoke-tested here.

## Context7 later

If version-specific framework documentation becomes a recurring bottleneck, configure Context7 in the coding client rather than adding it to the application:

```text
codex mcp add context7 --url https://mcp.context7.com/mcp
codex mcp list
```

Then query one library at a time, for example: `Use Context7 for Vue Router 4.6 navigation guards.` Do not send private application source or secrets to documentation services. Add an API key only through the client credential store if higher limits or private repositories are genuinely needed.

## UI/UX decisions for the next pass

The next product-facing improvement should be an evidence-led Dashboard and daily-entry UX pass, in this order:

1. Dashboard hierarchy: make the viewer's own status and primary action obvious before secondary team metrics.
2. Mobile entry flow: reduce vertical friction for cards and date/time entry without changing authorization or API contracts.
3. Feedback states: standardize loading, empty, error, success, and permission states using existing panel/button tokens.
4. Accessibility: keyboard focus, labels, contrast, and screen-reader structure for forms, popups, tables, and responsive cards.
5. Browser evidence: capture console/network/accessibility and responsive checks before accepting visual changes.

Do not introduce 21st-generated components or a new design system until a specific Vue-compatible gap remains after this pass.

## Rollback

The tooling setup is reversible and separate from runtime code:

1. Delete the three directories under `.agents/skills/` and `skills-lock.json`.
2. Remove the development-tooling section from `AGENTS.md`, this file, the README pointer, and the changelog entry if the documentation change is also being reverted.
3. No `package.json`, lockfile, database migration, Cloudflare binding, credential, or production asset needs to be reverted.

## Official sources checked

- Agent Skills: <https://github.com/addyosmani/agent-skills>
- Context7 MCP: <https://github.com/upstash/context7> and <https://context7.com>
- 21st MCP: <https://mcp.21st.dev/mcp>
- Graphify: <https://github.com/Graphify-Labs/graphify>
- Strix: <https://github.com/usestrix/strix>
- Codex MCP configuration: <https://developers.openai.com/learn/docs-mcp>
