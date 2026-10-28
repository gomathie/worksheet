# Local Development

## Prerequisites

- Node.js compatible with the repository's current toolchain (Node 22 was used for the latest baseline).
- npm and the checked-in `package-lock.json`.
- Wrangler available through the local dev dependency.
- Git Bash or WSL if using `scripts/seed-admin.sh` on Windows.

## First setup

```bash
npm ci
cp .env.example .env.local
npm run db:migrate:local
```

Do not put real production tokens in `.env.local`. It is ignored by Git.

## Run the app

The full local Pages runtime builds the app and serves it on port 8788:

```bash
npm run dev
```

For Vite UI hot reload, keep the Pages server running and start a second process:

```bash
npm run dev:web
```

Vite runs on port 5173 and proxies `/api` to `http://127.0.0.1:8788`.

## Local admin account

The first administrator can be created with `scripts/seed-admin.sh "Name" email` from Git Bash/WSL, then given a username and password through the app. Once an admin exists, use the Employees page to create and approve other accounts. Never copy production credentials into local fixtures.

## Local database

Apply pending migrations with:

```bash
npm run db:migrate:local
```

Inspect `migrations/` before naming a new file; some numeric prefixes are duplicated because of parallel historical work. Do not run `npm run db:migrate:prod` during ordinary development.

## Troubleshooting

- If the UI loads without API data, confirm the Pages server is running on port 8788 and that Vite is proxying `/api` there.
- If a schema error appears, apply the local migrations again and inspect Wrangler's migration list.
- If a route chunk is stale after a build, reload the app; production also includes one-time route-chunk recovery.
- If browser verification is needed, use the project's Playwright fallback or the isolated Chrome DevTools MCP only when it is configured.
