# Ledger — What This App Does

Ledger is a single-page, single-file web app (`timesheet-tracker.html`) for tracking a small team's. Now move to vue js
daily work hours, "classifications," and "QAP" (quality assurance points/items), and turning those
into a points-based remuneration report. There is no build step, backend, or database — the entire
app is one HTML file with inline CSS and vanilla JS. and vue

It has four tabs: **Time Entry**, **Dashboard**, **Monthly Report**, and **Settings**.

## Data & storage

- All data (employees, entries, settings) is read/written through a `window.storage` key/value API
  (`storeGet` / `storeSet`), not a real database.
- The header explicitly notes: _"Data is shared across everyone using this tool link"_ — anyone with
  the link sees and edits the same shared data. There is no login, no roles, and no per-user
  permissions — everyone effectively has admin access.
- Data persists as three keys: `employees`, `entries`, `settings`.

## Time Entry tab

- **Team roster:** add employees by name (as chips); duplicate names (case-insensitive) are rejected.
  Removing an employee who has logged entries prompts for confirmation but keeps their historical
  entries.
- **Log a day form:** employee (dropdown), date, time start, time end, classifications (count),
  QAP (count), optional notes.
  - Hours is a read-only field that auto-calculates live from start/end time.
  - Overnight shifts are supported: if end time is not after start time, it's treated as crossing
    midnight (adds 24h).
  - Hours are rounded to 2 decimals.
- **Edit / delete existing entries** from the table below the form (edit repopulates the form and
  switches it into "update" mode; delete asks for confirmation).
- **Entries table:** shows date, employee, start/end, hours, classifications, QAP, computed points,
  notes, and row actions. Filterable by month and by employee.

## Dashboard tab (admin-style overview)

- Month picker (defaults to current month).
- **Hero "stamp"**: total hours logged for the month, styled as a circular stamp graphic.
- **Stat cards**: total classifications, total QAP, total points, and estimated remuneration for
  the month.
- **Bar chart**: classifications vs. QAP per day of the month (two color-coded series), built with
  plain CSS/DOM bars (no charting library, despite `chart.js`/`vue-chartjs` being listed as
  dependencies).
- **Per-person summary table**: days worked, hours, classifications, QAP, points, and estimated
  remuneration per employee, sorted by points descending.
- **Daily detail table**: every entry for the month, one row per employee per day.

## Monthly Report tab

- Month picker plus a **"Print / Save as PDF"** button that triggers `window.print()`.
- A print-optimized layout (`@media print` hides nav/buttons/filters, prints only the report section).
- Report contents: per-person totals table (with a grand-total footer row), a full daily detail
  table, and a footnote stating the rates applied (e.g. "1 point per classification, 1 per QAP,
  $1.00 per point") plus the generation date.

## Settings tab

- Four configurable values, applied retroactively to all past and future entries:
  - Points per classification
  - Points per QAP item
  - Value per point
  - Currency symbol
- Saving updates every downstream calculation (entry table points, dashboard totals, report totals)
  immediately.

## Points & remuneration formula

```
points        = classifications × points_per_classification + qap × points_per_qap
remuneration  = points × value_per_point
```

Computed identically everywhere in the app (entry table, dashboard, report) using the current
`settings` values — there is no historical/point-in-time locking, so changing settings retroactively
recolors all past reports.

## Design

Editorial/almanac visual style: cream background, ink-black text, teal + amber accents, Barlow
Condensed for headings, IBM Plex Mono for numbers, Inter for body text, pill-shaped nav buttons,
thin borders instead of shadows, and a rotated circular "stamp" as the dashboard's signature visual.
Fully responsive with horizontal-scrolling tables on small screens.

## What's scaffolded but not actually built

`BUILD_PROMPT.md`, `package.json`, `wrangler.toml`, and `vite.config.ts` describe a much larger
planned version of this app: Vue 3 + Pinia + Vue Router frontend, a Cloudflare Workers API, a D1
database with `employees`/`entries`/`settings`/`audit_log` tables, real admin/employee roles enforced
server-side, magic-link or one-time-code auth, and Cloudflare Pages deployment. None of that exists
yet — there's no `src/`, `migrations/`, or API code in the repo. The current app is a self-contained
HTML prototype that stands in for it.
