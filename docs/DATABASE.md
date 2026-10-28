# Database and Migrations

## Database

The application uses Cloudflare D1, a SQLite-compatible database, through the `DB` binding declared in `wrangler.toml`. SQL is stored in `migrations/` and applied with Wrangler's migration tracking.

## Local workflow

```bash
npm run db:migrate:local
```

Inspect the migration directory before choosing a filename. Historical parallel work created duplicate numeric prefixes, so filenames—not the numeric prefix alone—are the source of truth.

## Creating a migration

1. Choose the next unused descriptive filename after inspecting the directory.
2. Use forward-only SQL with explicit defaults, constraints, foreign keys, and indexes where needed.
3. Update server row types and queries in the same change.
4. Update shared types, API behavior, tests, and user/admin guidance when the schema changes behavior.
5. Apply locally and run the full validation gate.

## Remote migration warning

The remote D1 migration endpoint can split SQL incorrectly when a migration contains `CREATE TRIGGER` or another `BEGIN ... END` block. Follow the workaround documented in `README.md`: execute the file remotely, then record the filename in `d1_migrations`. Prefer keeping triggers out of new migrations where practical.

Never run remote migrations or deployment as part of ordinary local testing without explicit authorization.
