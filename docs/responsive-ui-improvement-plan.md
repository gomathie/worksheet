# Responsive UI Improvement Plan

Status: Work packages 1-3 complete; Work package 4 next
Owner: Any contributing agent  
Branch: `main`  
Created: October 27, 2026

## Purpose

Reduce accidental horizontal scrolling, make mobile navigation easier to use, and
standardize responsive behavior without changing authorization, API contracts, or
existing business rules.

The current application already has useful responsive foundations:

- `table.data` becomes card-like below 767px.
- Buttons have keyboard focus styles and touch-friendly sizing.
- The existing teal, ink, cream, panel, and line tokens should remain the visual source of truth.
- Dense data tables may still scroll horizontally when comparison requires it.

The goal is to distinguish intentional scrolling from accidental overflow rather
than removing every horizontal scroller.

## Guardrails for every work package

- Read `AGENTS.md` before changing code.
- Preserve server-side authorization and all existing route guards.
- Do not change API response shapes for a visual-only improvement.
- Reuse existing classes and components before adding new abstractions.
- Do not add dependencies unless the existing implementation cannot support the change.
- Keep each work package focused and review its diff before moving on.
- Update `AGENTS.md` and `changelog.md` after implementation work.

## Work package 0: Establish responsive evidence

### Goal

Create a repeatable baseline before changing layout code.

### Inspect

- `src/App.vue`
- `src/style.css`
- `src/components/MonthPicker.vue`
- `src/views/DashboardView.vue`
- `src/views/SettingsView.vue`
- All views using `.table-wrap`, `table.data`, `whitespace-nowrap`, or `overflow-x-auto`

### Verify

Test at 320px, 375px, 768px, 1024px, and 1440px. Record:

- Body-level overflow
- Intentional table overflow
- Navigation overflow
- Clipped text, buttons, or form controls
- Console errors and failed requests

Use Playwright as the local fallback. The browser-testing skill's Chrome DevTools
workflow can be used when that MCP connection is available.

### Done when

- Every known overflow source is classified as intentional or accidental.
- Affected routes and reproduction steps are written in the implementation PR or work log.
- No application behavior has changed.

## Work package 1: Simplify mobile navigation

Status: Complete

### Files

- `src/App.vue`
- `src/style.css`

### Current concern

The app can render a primary navigation strip plus a Reports, Finance, or Admin
strip. Multiple horizontal strips make mobile navigation feel like the whole page
is wider than the viewport.

### Implementation

Below the mobile breakpoint:

1. Keep the primary section navigation visible.
2. Consolidate section-specific links into one contextual control, such as a compact
   `More` menu or section dropdown.
3. Preserve desktop navigation and route permissions.
4. Preserve active-route styling and the current section fallback behavior.
5. add a button to clcik and add app to homepage.
6. Ensure the menu has keyboard focus, an accessible label, and predictable close behavior.

### Acceptance criteria

- No more than one horizontal navigation strip is visible on mobile.
- The current page and section remain obvious.
- All links remain reachable for keyboard and touch users.
- Users without a right never see a link they could not already access.

### Implementation notes

- Added shared `reportsLinks`, `financeLinks`, and `adminLinks` data in `src/App.vue` so desktop and mobile navigation use the same permission-filtered link lists.
- Added one mobile-only contextual section menu with keyboard focus restoration and Escape handling.
- Kept the primary navigation as the only horizontal mobile navigation strip.
- Kept the existing section strips visible on tablet and desktop.
- No API, route permission, or server authorization behavior changed.

### Verification

- `npm.cmd run build`: passed.
- `npm.cmd test`: 12 files and 280 tests passed.
- Playwright shell check: no body-level horizontal overflow at 320px, 375px, 768px, 1024px, or 1440px on the accessible route.
- Full authenticated menu verification remains a follow-up because this session has no test login session.

## Work package 2: Make dashboard controls wrap cleanly

Status: Complete

### Files

- `src/views/DashboardView.vue`
- `src/components/MonthPicker.vue`

### Current concern

The custom date range contains two native date inputs in a non-wrapping flex row.
At 320px and 375px, the date controls can become cramped or overflow.

### Implementation

- Stack the custom date inputs below 640px.
- Keep the compact inline layout from 640px upward.
- Allow the dashboard filter/action group to wrap.
- Make narrow-screen controls full width where that improves usability.
- Keep month mode and custom range mode behavior unchanged.

### Acceptance criteria

- Month mode fits at 320px.
- Custom range mode fits at 320px and 375px without clipping.
- Date inputs remain large enough to use comfortably by touch.
- Desktop spacing remains compact and aligned.

### Implementation notes

- Made the dashboard range selector full-width on phones and compact from the `sm` breakpoint upward.
- Stacked custom start/end date fields below 640px and kept them inline on larger screens.
- Added accessible labels for the range selector and both date inputs.
- Preserved the existing month/custom mode state and API query behavior.

### Verification

- `npm.cmd run build`: passed.
- `npm.cmd test`: 12 files and 280 tests passed.
- Playwright smoke test with a mocked authenticated user: dashboard rendered at 320px, 375px, 768px, 1024px, and 1440px; custom dates rendered at 375px; no body-level horizontal overflow was detected.

## Work package 3: Standardize responsive data tables

Status: Complete

### Files

- `src/style.css`
- Views containing `.table-wrap` or `table.data`
- Any screen-only raw table, especially `src/views/ExpensePackView.vue`

### Implementation

1. Keep `table.data` card conversion for mobile.
2. Move screen-facing raw tables onto the shared table pattern where appropriate.
3. Leave print-only tables unchanged when their structure is required for printing.
4. Add a shared horizontal-scroll treatment for genuinely dense tables:
   - `max-width: 100%`
   - contained horizontal overscroll
   - subtle edge shadow or scroll hint
   - accessible region label
5. Limit `whitespace-nowrap` to dates, amounts, identifiers, and short statuses.
6. Allow names, descriptions, notes, and categories to wrap.

### Accessibility requirements

Any table that intentionally scrolls horizontally should have an understandable
accessible name, for example `aria-label="Recent expense activity"`. Do not add
`tabindex` to every wrapper automatically; only make a region keyboard-scrollable
when keyboard users otherwise cannot reach its content.

### Implementation notes

- Strengthened `.table-wrap` with width containment, contained horizontal overscroll, scroll padding, and thin native scrollbars.
- Extended the existing table observer in `src/main.ts` to detect actual overflow after render and on resize.
- Only overflowing wrappers receive keyboard focus, `role="region"`, and an accessible label derived from the nearest panel heading.
- Non-overflowing mobile card tables remain out of the tab order.
- Left the `ExpensePackView.vue` raw table unchanged because it is a print-only document table rather than a screen-facing data table.

### Verification

- `npm.cmd run build`: passed.
- `npm.cmd test`: 12 files and 280 tests passed.
- Playwright table smoke test with a mocked authenticated user: mobile card tables did not become overflow regions at 375px; wide dashboard tables became labelled, keyboard-scrollable regions at 768px and 1024px; no body-level horizontal overflow was detected.

### Acceptance criteria

- No screen-level body overflow is required to view table content.
- Mobile card tables remain readable and preserve data labels.
- Dense comparison tables remain usable on desktop and mobile.
- Table actions do not force a row wider than its container.

## Work package 4: Clean up long content and action groups

### Likely files

- `src/views/EmployeesView.vue`
- `src/views/TasksView.vue`
- `src/views/EntriesView.vue`
- `src/views/ExpensesView.vue`
- `src/views/ExpenseDetailView.vue`
- `src/views/PaymentsView.vue`
- Shared button rules in `src/style.css`

### Implementation

- Add `min-w-0` and wrapping to long text containers.
- Remove unnecessary `shrink-0` and `whitespace-nowrap` from descriptive content.
- Let action groups wrap on narrow screens.
- Reuse the existing responsive action-menu pattern when a row has too many actions.
- Keep destructive actions visually distinct and keyboard accessible.

### Acceptance criteria

- Long employee names, task titles, voucher descriptions, and announcement text do not clip.
- Row actions remain reachable at 320px.
- Touch targets remain at least as comfortable as the current button rules.

## Work package 5: Improve Settings navigation on mobile

### Files

- `src/views/SettingsView.vue`
- `src/style.css`

### Implementation

Below 640px, replace or supplement the horizontal Settings tab strip with a compact
select or a small responsive grid. Keep the current button tabs on tablet and
desktop. Preserve the active tab URL state and permission behavior.

### Acceptance criteria

- Settings sections are accessible without horizontal scrolling on mobile.
- The active section is obvious.
- Reloading or sharing the Settings URL still opens the requested section.

## Work package 6: Accessibility and finish pass

### Verify

- Keyboard-tab through navigation, menus, filters, table actions, and forms.
- Confirm visible focus styles.
- Confirm every icon-only control has an accessible label.
- Confirm active state is not conveyed by color alone.
- Check loading, empty, error, success, and permission states.
- Check reduced-motion behavior for any new menu or transition.
- Check contrast using the existing design tokens.

## Verification after each work package

Run:

```powershell
npm.cmd test
npm.cmd run build
```

For responsive work, also verify the affected routes at:

- 320px
- 375px
- 768px
- 1024px
- 1440px

Before completion:

- Review `git diff` and `git status`.
- Confirm no authorization or API behavior changed.
- Confirm no unrelated files were modified.
- Add a dated work-log entry to `AGENTS.md`.
- Add a concise entry to `changelog.md`.

## Recommended execution order

1. Work package 0: baseline evidence
2. Work package 1: mobile navigation
3. Work package 2: dashboard controls
4. Work package 3: responsive tables
5. Work package 4: long content and action groups
6. Work package 5: Settings navigation
7. Work package 6: accessibility and finish pass

Work packages 1, 2, and 3 are complete. The next implementation slice should be
Work package 4, which handles long content and action groups without touching data
flow or authorization.
