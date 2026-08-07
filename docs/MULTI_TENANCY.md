# Multi-tenancy — migration plan

**Status:** proposal. Nothing in this document has been built.
**Decision needed:** which of the two approaches in §3, and how many tenants
are expected. That number is what decides it.

---

## 1. What this is for

Today the app serves one organisation. This plan covers serving several from
one codebase, and controlling which modules (e.g. *Data Analytics*) each one
gets.

It is written to be judged before any code is committed to. §7 is the honest
risk list; read it before §5.

---

## 2. Where we are starting from

Measured against the current code, not estimated:

| | Count |
|---|---|
| Tables | 24 |
| Prepared statements in `functions/` and `server/` | 211 |
| Global singletons that would collide between tenants | 2 |
| Unique indexes that would need re-scoping | 4 |
| Hardcoded organisation identifiers | 1 |

**The two singletons.** `settings` is keyed on `key` alone, so two tenants
would overwrite each other's currency and workflow config.
`expense_voucher_seq` is keyed on `year` alone, so tenants would consume each
other's voucher numbers.

**The four unique indexes.** `expense_vouchers.voucher_number`,
`employees.employee_code`, `employees(lower(username))`, and
`push_subscriptions.endpoint`. Each currently guarantees global uniqueness;
each must become unique *per tenant* instead, or two customers cannot both
have an `admin` user or an `EMP-001`.

**The hardcoded identifier.** `VOUCHER_PREFIX` in `shared/expenses.ts` produces
`COH-EXP-2026-0001`. Every tenant would issue vouchers under your prefix until
it becomes per-tenant configuration.

**Sessions are fine.** Keys are `session:${randomToken}`, so tenants cannot
collide. The stored value (`{ employee_id }`) gains a `tenant_id`, and that is
the whole change.

**Production is not empty.** There are real employees, entries, cards,
vouchers and petty-cash records. Whichever route is taken, that data becomes
"tenant 1" by migration — it cannot be started clean.

---

## 3. The two routes

Cloudflare shapes this decision. **D1 bindings are declared statically in
`wrangler.toml`; there is no runtime "open database by name" in the Workers
API.** The usual clean answer — one database per tenant, resolved per request
— is therefore not directly available. What remains:

### Route A — one deployment per tenant

Each customer gets their own Pages project, D1 database and KV namespace.

- **Isolation:** physical. A query bug cannot reach another customer's data.
- **Code change:** effectively none. The 211 statements stay as they are.
- **Cost:** per-tenant operations. Every deploy and every migration runs N
  times. No cross-tenant reporting or admin view.
- **Per-tenant config** (voucher prefix, currency, branding) moves to
  `[vars]` in each project, or stays in that tenant's `settings` table.

### Route B — one database, `tenant_id` everywhere

All tenants share the database; every row carries its owner.

- **Isolation:** logical only. **A single missed `WHERE tenant_id = ?` exposes
  one customer's data to another.** This is the whole risk of the route.
- **Code change:** all 211 statements, plus schema across 24 tables.
- **Cost:** one deploy, one migration run, cross-tenant admin is easy.

### Choosing

The deciding number is how many tenants are expected.

- **Up to ~5:** Route A. The ops overhead is small at that size and buys
  absolute isolation for almost no engineering. Tenants can also be upgraded
  and billed independently.
- **More than that, or self-serve signup:** Route B. Route A's per-tenant
  deploy and migration cost compounds and eventually dominates.

The rest of this plan details Route B, because Route A needs little planning —
it is the current app, deployed repeatedly, plus §6.

---

## 4. Route B — schema

A `tenants` table, then `tenant_id` on everything.

```sql
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,          -- resolves the tenant from the URL
  voucher_prefix TEXT NOT NULL DEFAULT 'COH',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_tenants_slug ON tenants(lower(slug));
```

Tables fall into three groups. **All three get `tenant_id`** — including the
child tables, even though it is derivable through their parent. Denormalising
it is what allows every query to be scoped the same way, which is what makes
the scoping auditable (§5).

| Group | Tables |
|---|---|
| **Tenant-owned** | `employees`, `work_types`, `departments`, `expense_categories`, `settings`, `expense_voucher_seq`, `month_locks`, `audit_log`, `login_codes` |
| **Owned via employee** | `entries`, `absences`, `adjustments`, `payments`, `notifications`, `push_subscriptions`, `petty_cash_ledger`, `petty_cash_requests`, `expense_vouchers`, `employee_work_types` |
| **Owned via a parent row** | `entry_items`, `entry_cards`, `expense_approvals`, `expense_attachments`, `expense_audit_logs` |

### Keys and indexes to change

```sql
-- settings: key alone is no longer unique
ALTER TABLE settings ...                  -- PRIMARY KEY (tenant_id, key)

-- voucher sequence: per tenant, per year
ALTER TABLE expense_voucher_seq ...       -- PRIMARY KEY (tenant_id, year)

-- month locks: per tenant
ALTER TABLE month_locks ...               -- PRIMARY KEY (tenant_id, month)

-- the four unique indexes become composite
DROP INDEX idx_expense_vouchers_number;
CREATE UNIQUE INDEX idx_expense_vouchers_number
  ON expense_vouchers(tenant_id, voucher_number);

DROP INDEX idx_employees_code;
CREATE UNIQUE INDEX idx_employees_code
  ON employees(tenant_id, employee_code);

DROP INDEX idx_employees_username;
CREATE UNIQUE INDEX idx_employees_username
  ON employees(tenant_id, lower(username)) WHERE username IS NOT NULL;

-- push endpoints stay globally unique: one browser subscription is one row,
-- and the same endpoint reaching two tenants would be a bug, not a feature.
```

SQLite cannot alter a primary key in place, so `settings`,
`expense_voucher_seq` and `month_locks` are rebuilt (create new, copy, drop,
rename) inside the migration.

---

## 5. Route B — scoping the 211 queries

**This is the part that decides whether the route is safe.** Adding
`WHERE tenant_id = ?` to 211 statements by hand and trusting review is how
tenancy bugs happen: the failure is silent, it looks like working software,
and it surfaces as one customer seeing another's payroll.

The plan is therefore to make an unscoped query *hard to write* rather than
merely discouraged.

1. **Resolve the tenant once, at the entry point.** `onRequest` in
   `functions/api/[[route]].ts` is the single door into the API. It resolves
   the tenant (§6) before any handler runs and fails closed — no tenant, no
   request.

2. **Never hand handlers `env.DB`.** Replace it with a scoped wrapper created
   per request:

   ```ts
   const db = tenantDb(env.DB, tenant.id)
   ```

   `tenantDb` exposes the same `prepare`/`batch` surface, but injects the
   tenant predicate and bind value. Handlers cannot reach the raw database
   because they are never given it.

3. **Make the raw handle unavailable by type.** `Env.DB` becomes internal;
   handlers receive `TenantDb`. A handler that tries to query across tenants
   fails to compile rather than failing in production.

4. **Test the boundary, not the handlers.** A test seeds two tenants with
   identical-looking data and asserts that every list endpoint returns only
   its own. This is the test that would actually catch a regression; unit
   tests on individual handlers would not.

5. **Migrate in slices, not in one pass.** One module at a time (entries →
   expenses → petty cash → admin), each slice landing with its own boundary
   test. 211 statements changed in a single commit cannot be reviewed
   meaningfully.

---

## 6. Resolving the tenant, and gating modules

### Resolution

Subdomain is the clearest: `acme.ledger.example.com` → `slug = 'acme'`.
Cloudflare Pages supports wildcard custom domains, so this needs no per-tenant
deployment. The fallbacks — a path prefix (`/t/acme/...`) or picking a tenant
at login — both leak into every URL or every session, so subdomain is
preferred unless the domain setup rules it out.

The session then carries the tenant, and **the request's tenant must match the
session's tenant** — otherwise a valid cookie from one tenant would work
against another.

### Which tenant uses which module

This is the cheap half, because of how modules were built: a module is a label
on `work_types`, and `work_types` is tenant-owned. **Each tenant therefore has
its own modules automatically** — no extra work at all.

Only *gating* needs anything: preventing a tenant from using a module even if
someone creates the work types.

```sql
CREATE TABLE tenant_modules (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module    TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, module)
);
```

A work type whose module is disabled for the tenant is hidden from the entry
form and refused by the API. Two tables and one check — the design decision
that made this small was keeping modules as a label rather than a table.

### Attachments

R2 keys become `${tenant_id}/${voucher_id}/${file}`. Currently uploads are
switched off (no bucket bound), so this costs nothing today — but the key
shape must be settled before the bucket is enabled, because rewriting keys
afterwards means moving objects.

---

## 7. Risks

1. **A missed scope leaks customer data.** The mitigation is §5 — structural,
   not procedural. If the wrapper is skipped for expediency on any handler,
   the route's safety argument collapses.
2. **The migration is not reversible in place.** Rebuilding three primary keys
   and backfilling 24 tables should be rehearsed against a copy of production
   before it is run against production.
3. **Cross-tenant admin is a second security surface.** Any "see all tenants"
   view deliberately defeats the scoping, so it needs its own authorisation
   and its own tests.
4. **Month locking and rate snapshots are per-tenant** and must not be locked
   or recalculated across tenants — worth an explicit test, as the figures are
   money.
5. **Existing production data must land in tenant 1** with no gap, including
   the append-only `expense_audit_logs`, which cannot be rewritten (its
   triggers reject `UPDATE`/`DELETE`) and so must be backfilled by a
   table rebuild inside the migration.

---

## 8. Suggested order

Each phase is independently reviewable and leaves the app working.

| Phase | Work |
|---|---|
| 1 | `tenants` table, `tenant_modules`, tenant resolution at `onRequest`, existing data backfilled as tenant 1 |
| 2 | `tenantDb` wrapper, `Env.DB` made internal, boundary test with two seeded tenants |
| 3 | `tenant_id` across the 24 tables; rebuild the three primary keys and four unique indexes |
| 4 | Scope handlers slice by slice: entries → expenses → petty cash → admin |
| 5 | Per-tenant voucher prefix and settings; R2 key prefixing |
| 6 | Tenant admin: create, deactivate, enable/disable modules |

Phases 1–2 are worth doing even if Route A is chosen later: they are what makes
the tenant concept exist at all, and the boundary test is what keeps it honest.

---

## 9. Open questions

1. **How many tenants are expected in the first year?** This decides §3.
2. **Do tenants get their own domain**, or a subdomain of one you control?
3. **Is any cross-tenant view needed** — a support console, or billing —
   or is each tenant entirely self-contained?
4. **Do tenants share a person?** If someone can belong to two tenants, the
   `employees` table needs a separate identity table above it, which is a
   larger change than anything above.
