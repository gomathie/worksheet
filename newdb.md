Database Migration: Cloudflare D1 → Supabase PostgreSQL

We currently use Cloudflare D1 as the application's database.

I want to migrate the application database from D1 to Supabase PostgreSQL.

Do not immediately start changing code.

First inspect the entire application and produce a migration plan based on the actual codebase.

Phase 1 — Audit the Existing D1 Implementation

Find every place where the application interacts with D1.

Inspect:

D1 database configuration

database bindings

environment variables

migrations

schema definitions

SQL queries

repositories/data-access functions

API endpoints

authentication/user queries

employee queries

task queries

work type queries

dashboard queries

report queries

notification queries

transaction usage

indexes

foreign keys

unique constraints

triggers

views

scheduled/background jobs

seed data

tests that depend on D1

Search the entire repository for things such as:

D1

DB

.prepare(

.bind(

.first(

.all(

.run(

.batch(

SQLite SQL

wrangler

database bindings

env.DB

context.env

Do not assume that every database interaction uses the same abstraction.

Phase 2 — Produce a Database Inventory

Before modifying anything, document the current database.

For every table identify:

table name

columns

data types

nullable fields

primary keys

foreign keys

unique constraints

indexes

default values

relationships

important business rules

Pay particular attention to relationships between:

users/employees

tasks

task assignments

work types

employee work-type assignments

reports

dashboard data

notifications

task history/activity

Also identify any tables that are effectively lookup/reference tables.

Phase 3 — Identify SQLite → PostgreSQL Differences

Audit every SQL query for SQLite-specific behavior.

Look specifically for:

SQLite data types

INTEGER PRIMARY KEY

boolean representation

date/time handling

datetime()

date()

strftime()

COALESCE

GROUP_CONCAT

SQLite-specific functions

INSERT OR REPLACE

INSERT OR IGNORE

ON CONFLICT

LIMIT/OFFSET

JSON functions

case-sensitivity assumptions

string concatenation

generated values

transaction behavior

parameter binding

foreign-key behavior

Create a list of queries that require modification for PostgreSQL.

Do not assume SQLite SQL and PostgreSQL SQL are interchangeable.

Phase 4 — Design the Supabase Schema

Create a PostgreSQL schema that preserves the existing application's behavior.

Use appropriate PostgreSQL types instead of blindly copying SQLite types.

For example:

IDs → determine whether existing IDs should remain text/UUID/etc.

timestamps → appropriate PostgreSQL timestamp type

booleans → boolean

numeric values → appropriate integer/numeric types

JSON → jsonb where appropriate

Do not change IDs unnecessarily.

Preserving existing IDs is important because existing records may reference them.

Preserve:

primary keys

foreign keys

unique constraints

indexes

relationships

Add indexes where required by the application's existing query patterns, but avoid unnecessary speculative indexes.

Phase 5 — Supabase Security

Determine whether the application will access Supabase:

through the Supabase client/API, or

directly through PostgreSQL from the server.

Prefer keeping privileged database access on the server if the existing application architecture already centralizes authorization there.

Do not expose privileged database credentials to the browser.

If Supabase Row Level Security is used, design policies based on the application's actual authorization model.

Do not assume Supabase Auth automatically replaces the application's current authentication system.

Inspect the existing authentication implementation before deciding whether Supabase Auth should be introduced.

Phase 6 — Preserve Application Authorization

This migration must NOT weaken the application's current permissions.

In particular, preserve:

admin permissions

employee permissions

work-type assignments

task permissions

dashboard access

report access

work-type data scoping

The existing rule is especially important:

Standard users must only receive data for work types they are assigned to.

Admins may continue to access the full dataset according to the existing authorization model.

The migration must not accidentally expose data simply because the new database has different query behavior.

Phase 7 — Task Assignment Compatibility

The application currently supports one primary task assignee and is being extended to support an optional second person as either:

Additional Assignee

Observer

Make sure the database migration design supports this correctly.

Do not make the migration dependent on the new feature unless necessary.

Existing tasks must remain valid.

If the task-assignment schema is being changed at the same time, clearly separate:

D1 → PostgreSQL migration

multiple-task-assignee feature

Do not mix unrelated schema changes without documenting them.

Phase 8 — Data Migration

Create a reliable migration process that can export all D1 data and import it into Supabase.

Requirements:

Preserve existing primary keys.

Preserve foreign-key relationships.

Preserve timestamps.

Preserve nullable values.

Preserve boolean semantics.

Preserve JSON data.

Preserve existing IDs.

Detect duplicate records.

Detect missing foreign-key references.

Report failed rows rather than silently ignoring them.

The migration must be repeatable where practical.

Do not modify production data destructively during development.

Phase 9 — Migration Validation

After importing into Supabase, compare D1 and Supabase.

At minimum compare:

row counts per table

primary-key coverage

foreign-key integrity

null counts for important fields

important aggregates

employee counts

task counts

work-type counts

assignment counts

report totals

For important business data, perform record-level comparisons where practical.

The migration should produce a clear validation report.

Example:

users
D1:       125
Supabase: 125
Status:   PASS

tasks
D1:       4,281
Supabase: 4,281
Status:   PASS

work_types
D1:       8
Supabase: 8
Status:   PASS

Phase 10 — Application Data Access Layer

Before replacing D1 everywhere, determine whether the application already has a database abstraction/repository layer.

If one exists:

adapt the existing abstraction to PostgreSQL.

If one does not exist:

consider creating a small data-access layer before performing the full migration.

Avoid scattering Supabase-specific calls throughout the Vue frontend.

Database access should remain server-side where appropriate.

Phase 11 — Environment Configuration

Identify all D1-related environment variables and configuration.

Create the corresponding Supabase configuration.

Never commit:

database passwords

service-role keys

private credentials

production connection strings containing secrets

Ensure browser-exposed environment variables contain only credentials that are explicitly safe to expose.

Phase 12 — Development Migration

Implement the migration in a development/staging environment first.

The sequence should be:

D1
 ↓
Export
 ↓
Transform
 ↓
Supabase PostgreSQL
 ↓
Validate
 ↓
Application switched to Supabase
 ↓
Run tests


Do not switch production immediately.

Phase 13 — Dual-Run / Cutover Strategy

Design a safe production cutover.

Prefer:

1. Backup D1
2. Stop writes temporarily
3. Export final D1 data
4. Import final data into Supabase
5. Validate counts/integrity
6. Switch application database configuration
7. Run smoke tests
8. Monitor
9. Keep D1 untouched as rollback source


Do not delete the D1 database immediately after cutover.

Keep it available until the Supabase system has been verified in production.

Phase 14 — Testing

Run all existing tests.

Additionally test:

Authentication

login

logout

current-user lookup

session handling

Employees

create

edit

list

permissions

Work Types

create

edit

assignment

filtering

Tasks

create

edit

assign

complete

filter

search

task history

Multiple Task Participants

Verify:

primary assignee

additional assignee

observer

no secondary person

duplicate assignment prevention

Dashboard

Verify:

admin sees permitted full data

standard users only see assigned work types

unassigned work types do not appear

totals are correctly scoped

Reports

Verify:

monthly reports

daily totals

per-person totals

work-type totals

detailed records

Compare important results against D1 before cutover.

Phase 15 — Performance

After migration, inspect the slowest queries.

Compare:

dashboard load time

report generation

task lists

employee lists

filtering

search

Add PostgreSQL indexes only where justified by actual query patterns.

Phase 16 — Documentation

Update AGENT.md with:

migration date

old database

new database

schema changes

migration scripts

environment variables

data validation results

deployment steps

rollback procedure

known differences

remaining D1 dependencies

Important Rules

Do NOT:

blindly convert SQLite SQL to PostgreSQL

delete D1 before validation

expose database secrets

move privileged database access into the browser

weaken existing authorization

remove work-type scoping

change unrelated application behavior

rewrite existing IDs without a compelling reason

silently discard migration failures

assume Supabase Auth is required just because Supabase is being used

mix unrelated refactors into the migration

First Deliverable

Before making significant code changes, give me a report containing:

Current D1 architecture

All D1 tables

Table relationships

All D1 access points

SQLite-specific queries that need conversion

Recommended Supabase schema

Recommended migration strategy

Estimated risky areas

Required environment changes

Testing strategy

Rollback strategy

Files that will need modification

Then wait for approval before performing the full migration.