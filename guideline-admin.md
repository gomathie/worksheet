# OpenSignal Ledger — Admin Guide

Setting up people, rights, work types and the expense workflow — everything on
top of the **User Guide** (Account menu), which still applies to you too:
you log time, tasks and expenses the same way everyone else does.

---

## People and rights

**Employees** — add someone, or edit anyone.

Each person has a **name**, optional **email** and **phone**, a **username and
password** for signing in, an auto-generated **staff code** (e.g. `ID-2023001`
— the prefix is whatever's set in Settings, see below), a **department**, and
a **Reports to** manager — set that last one to make
somebody a manager for expense review. Phone is only used for SMS
notifications (see **Admin → Notifications** below) — it's not needed to sign
in, and the employee can set it themselves too (Account menu → Edit profile).

### Data scope

Decides **whose records a person can see**:

| Scope | Sees |
|---|---|
| `Own records only` (default) | Only their own |
| `Own plus direct reports` | Own, plus anyone whose *Reports to* is them |
| `Own department` | Everyone in the same department |
| `Everyone` | All records |

Administrators see everything regardless. Scope is enforced on the server, not
just hidden in the interface. This scope also dictates what employees see on the **Dashboard** and **Monthly Reports** — they will only see statistics for the people within their scope.

### The rights

| Right | Grants |
|---|---|
| Add / Edit / Delete own entries | Three separate controls over their own time entries. Edit covers adding to or correcting an entry; taking recorded work away — removing a card, or lowering a typed count — needs Delete too, enforced server-side, since reducing what's logged destroys it just as surely as deleting the entry outright |
| View dashboard | The team dashboard |
| View monthly reports | The monthly report **and Card Audit** |
| View own remuneration / payslip | Their own pay figures |
| View own points | Points as a score. Forced off if either pay right is held — points beside a cedi amount reveals the value per point |
| Record paid leave | Log the paid *Leave* absence type |
| Direct counts | Type Classification/QAP counts instead of logging cards |
| File expenses | Create and submit vouchers |
| Review expenses | Manager review — **only for their own direct reports**, never their own voucher |
| Send for approval | Screen a submitted voucher (and raised reimbursements) and put it to an approver |
| Record expenses | Book an approved voucher into the external accounts. Organisation-wide |
| **Approve expenses** | Final approval. **Requires the admin role as well** |
| Add users | Propose a new account, which lands pending |
| **Approve users** | Activate a pending account. **Requires the admin role as well** |
| Petty cash | Hold a float and charge vouchers to it |
| Manage tasks | Assign tasks to others and see the whole board. The holder gets an assignee picker **on each task card**, so reassigning never means opening the task first. They can also add secondary assignees or observers. |
| Delete tasks | Delete a task that has been assigned to someone else |
| Send announcements | Post to News. You can specify an **Author Name** (e.g., "Management") so the announcement is sent from a specific entity rather than defaulting to "System". |
| Login as others | Impersonate another user without knowing their password |
| **Manage point deductions** | Deduct points from employee balances as disciplinary penalties or record formal pardons ("Let it go"). Implied by admin role, grantable individually to non-admins |

**Two rights the admin role does not carry automatically: `Approve expenses` and
`Approve users`.** An approver is an administrator who has *also* been ticked for
it. This is deliberate — it lets you have administrators who can see everything
and change nothing about approval. Every other right comes free with the role.

### Adding people without being an administrator

Anyone with **Add users** can propose an account from the **Approvals** page. It
lands **pending**: it cannot sign in and is invisible elsewhere until someone
with **Approve users** activates it. The proposer sets only a name, email,
username and password — **role, rights and data scope are yours to set after
approval**. Rejections need a note.

### Switching users ("Login as")

Administrators (and employees granted the **Login as others** right) can temporarily sign in as any employee without knowing their password:

- **Quick Switch**: At the top of the **Team** card on the **Employees** page, select any employee from the **Switch User** dropdown and click **Login as**.
- **Per-row button**: In the Team table's rightmost **Actions** column, click the teal **Login as** button next to that employee.
- **Impersonation Banner**: While viewing the app as another person, a prominent amber banner appears at the very top of every screen: *"Logged in as [Employee] (by [Admin Name])"*.
- **Returning to Admin**: You can return to your admin account at any time in one click without re-entering passwords:
  - Click the **Return to Admin** button in the top impersonation banner.
  - Or open the **Account** dropdown in the header and click **↩ Return to Admin**.
  Both options instantly terminate the impersonation session, restore your admin session, and return you back to the Employees screen.
- **Audit tracking**: Switching into another user's account and returning to admin both generate secure audit entries (`impersonate_user` and `exit_impersonation`) in the activity log.

## Work types, points and modules

**Settings → Work types & points.**

- Each type is worth **points per unit**. Points × **value per point** = money.
- **Cards** ticked means the type is logged as individual cards rather than a
  typed count (Classification, QAP).
- **Module** groups related types under one heading — Classification and QAP sit
  under *Data Analytics*. Leave blank for a standalone type. 
  **Important**: Assigning an employee to a work type that has a module automatically grants them access to ALL other work types in that same module.
- Deactivate a type rather than deleting it; past figures keep working.
- Assign types to people in **Employees**. Someone with no countable types is
  tracked by hours and notes alone. Per-person **rate overrides** are available.

**Changing a rate recalculates every past and future figure** for any month that
isn't locked. See month-end locking below.

## The expense workflow

Four separate authorities, so no one person carries a claim end to end:

| Right | Does |
|---|---|
| **File expenses** | Creates and sends |
| **Send for approval** | Screens and passes it on, or returns it |
| **Approve expenses** | Gives or refuses approval |
| **Record expenses** | Books an approved voucher into the accounts |

Screening is not approval, and **recording cannot happen before approval** — the
button doesn't exist until a voucher is approved.

Pages: **Approvals** (manager review and final approval), **Screening**, **To
Record**.

**Settings → Expense workflow** controls the manager step only. Approval and
recording are never optional. Employees with no manager assigned skip the manager
step, so nothing waits in a queue nobody owns.

**Editing lock:** approved and recorded vouchers are frozen. An administrator
must explicitly **reopen** one before it can change, which also clears its
recorded reference — so the entry in your external records will no longer match.
Reopening asks you to confirm for that reason.

**Internal Expenses ("Keep in App"):** Not all approved expenses need to be forwarded to an external accounting or ERP system. The app allows keeping expenses internally:
- Approvers can choose **Approve & Keep in app** during the final approval stage.
- Finance recorders can choose **Keep in app** with an optional justification note directly from the *Expenses to record* queue.
- Administrators can also check **Keep in app** when initially drafting an expense voucher.
- Kept-in-app expenses are fully settled and auditable, but do not populate external recording queues.
- Administrators can reopen a kept-in-app voucher if revisions are required.

**Kept in App Report:** Accessible from the *Expenses to record* queue or under **Reports → Expense Reports** (select *Kept in app (Internal expenses)*):
- **Annual Total:** Displays the grand total expenditure kept in app for the calendar year and total voucher count.
- **Monthly Breakdown:** Detailed monthly breakdown table showing voucher counts and total amounts for each month.
- **Detailed Vouchers:** Complete listing of individual vouchers including voucher number, expense date, employee, category, amount, who decided to keep it in the app, and reason notes.
- **Exporting:** Supports export to CSV, Excel, and PDF print formatting.

**Monthly audit pack** (*Expenses → Pack*): one button produces a cover sheet
listing every settled voucher for a month with a total, then each voucher on its
own page. Only **approved** and **recorded** vouchers are included — anything
still in flight has no standing as evidence.

## Card Audit

**Reports → Card Audit** answers *who classified or QAP'd this card*. Search a
name, or leave it blank for everything, across one month or all.

- **Red** — the same work type was logged **twice on one day**. That can't be
  rework, so it's a double entry or two people on the same card.
- **Amber** — the same card recurred **on different days**, which often *is*
  legitimate rework.
- The offending rows are highlighted, and flagged cards sort to the top.
  Exports to CSV. Rows are grouped by day, and **Open** takes you straight to
  the entry to act on it.

This is also where a duplicate reported by the entry-form warning ends up, so
it's the place to check when a notification says somebody continued past one.

## Installations & device types

**Reports → Installations** breaks down telematics installation activity by
device type and new-vs-replacement, and ranks **which devices get replaced
most** — the number to watch if a particular make is proving unreliable.

**Settings → Device types** is where the make list itself is managed (add,
rename, deactivate) — the same list offered on an installation card. Anyone
doing installation work can suggest one that's missing from the entry form; it
shows up here under **Suggested by installers** with who proposed it, and:

- **Approve** — it joins the list immediately, usable on any card from then on.
- **Reject** — needs a note explaining why; the suggestion never becomes
  selectable.

A suggestion is inactive and invisible everywhere else until you decide it, so
nothing is usable on a card without your say-so.

## Payments

- **Bonuses** — add one with a description; it counts immediately.
- **Reimbursements** — employees request; you approve or reject. Only approved
  ones count. A claim goes `pending → awaiting approval → approved`, with
  screening in between, so what you decide on has already been checked.
  Claims appear on the **Approvals** page alongside the vouchers — to screen
  if you hold *Send for approval*, to decide if you hold *Approve expenses* —
  and everyone involved is notified at each step (the bell, plus email/SMS if
  configured). You can also **Return for more info** instead of deciding: the
  claim goes back to the employee with your note attached, and they're told
  what's needed.
- **Mark paid** when money goes out; the employee then **confirms receipt**.
- **Trail** — click it next to anyone in the payouts table when a total looks
  off. It lays out every entry and every bonus/reimbursement behind that
  person's figure for the month, in the order it actually counted, each with
  a running total and (for bonuses/reimbursements) who added it and when —
  so "why did this number move" has a direct answer.

## Petty cash administration

**Floats held** lists every holder with what they were **issued**, what they've
**used** (and what percentage of their float that is), and what they should
still be **holding** — with a totals row giving the organisation-wide figure
that has to reconcile against physical cash.

**Petty Cash** additionally shows every float, the pending request queue, and the
direct issue/recover form.

- **Issuing, recovering and correcting floats is admin-only.**
- On a top-up request, confirm **what was actually handed over and how** — cash
  or mobile money, with an optional reference such as a MoMo transaction id. The
  confirmed amount may differ from what was requested, and **only the confirmed
  figure reaches the ledger**. Declining needs a note.
- Handing back more than is held is refused — use an adjustment.

## Month-end locking

Locking a month **freezes the data and the rates**. The lock captures a snapshot
of the point value, currency, per-type points and per-person overrides, so later
rate changes never alter a locked month's report or payslips. Entry and
adjustment changes for a locked month are refused.

Unlock if corrections are needed.

## Task management & oversight

The **Tasks** board allows assigning and monitoring work outside of time entries and expenses:

- **Assignees & Observers**: Tasks support a primary assignee plus an optional secondary participant designated as either an **Additional Assignee** (can edit and complete the task) or an **Observer** (view-only follower).
- **Recurrence**: When creating or editing a task, choose **Recurrence** (Daily, Weekly, Monthly). Once marked *Done*, a new instance of the task automatically generates with an updated due date.
- **Task Comments**: Each task detail page features a real-time discussion thread. Adding a comment automatically dispatches notifications to the creator and assignees.
- **Reopen**: A **Reopen** button on a Done or Cancelled task (list and detail page)
  moves it back to **To do**, for when it turns out there's more to do. Clears
  `completed_at` and, like any other change, resets the 5-day violation clock
  below. Same permission as any other status change — assignee, raiser, or a
  **Manage tasks** holder.
- **Inactivity & Task Age Alerts**: Incomplete tasks trigger automated daily alerts:
  - Over 2 days old: warns the assignee that uncompleted tasks impact payment.
  - Over 3 days old: warns that the task is scheduled for deletion/reassignment and will affect compensation.
  - The **Working on it** button on in-progress cards refreshes the task's timestamp and pauses the aging warning.
- **Automatic task-violation point deduction**: An open task (To do or In
  progress) that goes **5 days** without being touched automatically deducts
  points from its assignee's balance — no admin action needed. See **Task
  violation penalty** under *Other settings* for the amount, and *Point
  deductions & penalties* below for where these show up in the audit trail.
  There is no scheduled job behind this: it runs opportunistically whenever
  anyone's task list is fetched (the Tasks page, the age-warning pop-up, an
  admin's "everyone" task view), so an idle instance of the app can take a
  little while to catch a newly-stale task — it isn't checked by the minute.
- **Log violation (manual)**: On a task's own page, anyone holding **Manage
  point deductions** (admins always do) sees a **Log violation** button next
  to Delete — for a specific, noticed problem (e.g. *"found a mistake on this
  QAP card"*) rather than the generic 5-day inactivity check above. It opens
  the same deduction form as the Employees tab's **Deduct**, pre-filled with
  this task's reference and the configured penalty amount (still freely
  editable — type a different number for a more or less serious violation).
  Not shown for a task with no assignee, or for your own tasks — the
  deduction API refuses self-deductions.

## Leave & time-off approvals

The **Leaves (Time Off)** system provides structured multi-day absence tracking:

- Accessible under **Reports → Leaves (Time Off)** (`/time-off`).
- Employees submit requests specifying category (*Sick, Vacation, Personal, Unpaid*), date range, and reason.
- Admins and managers review requests in the pending queue to **Approve** or **Reject** with comments.
- Approved leave automatically deducts from the employee's annual leave allowance if one is configured in **Employees**.

## Other settings

- **Employee code prefix** — the `ID-2023` in `ID-2023001`. Changing it only affects codes
  assigned from then on; existing staff codes don't get rewritten.
- **Departments** and **expense categories** — add, rename, deactivate.
- **Device types** — the telematics device make list, including the queue of
  suggestions from installers. See *Installations & device types* above.
- **Task violation penalty** — under **Settings → Money & currency**, how many
  points are automatically deducted when an open task goes 5 days untouched
  (see *Task management & oversight* above). Set to **0 to disable** the
  automatic deduction entirely without touching anything else. Takes effect
  on the next violation found — it isn't retroactive.
- **Download backup** — a full JSON export.

## Admin → Notifications

A third tab next to Employees and Settings, for everything about reaching
people rather than configuring data:

- **Email (SMTP)** — point the app at any SMTP server (port 587 STARTTLS or 465
  TLS). The password is write-only; **Send test email** verifies it.
- **SMS (mnotify)** — same idea, over SMS: enter your mnotify API key and a
  sender ID (max 11 characters), then **Send test** to check it. Only reaches
  employees who have a **phone** number set — an admin sets it in the
  Employees tab, or an employee sets their own under Account menu → Edit
  profile. The API key is write-only, same as the SMTP password.
- **News Announcements & Custom Author** — post updates to the News feed and login pop-ups. You can specify a custom **From whom** author (e.g. "Management", "Operations", or leave blank for "System").
- **Weekly Digest** — automated periodic summaries can be triggered via `/api/cron/weekly-digest` to email/push weekly hours and unit summaries to all active team members.

## Activity log

**Reports → Activity** is the administrator audit trail: who did what, when.

The **expense** audit trail is separate and stronger — it is **append-only,
enforced by the database itself**. Edits and deletions of that log are rejected
by SQLite, not merely avoided in code, so a voucher's history cannot be quietly
rewritten.

## Month-end locking & default auto-lock

Rates and figures for completed work must stay reliable over time. The app enforces strict month locking:

- **Automatic default lock at month end**: When a calendar month ends (i.e. strictly prior to the current month), it is **locked by default**. Its rates are frozen and further additions or modifications to entries, adjustments, and reimbursements are blocked on both the server and client.
- **Unlocking past months for edits**: If an administrator needs to make retrospective adjustments, load the month in **Monthly report** and click **Unlock month**. An exemption is recorded allowing administrators to edit figures and rates. An amber reminder banner appears warning that the past month is currently unlocked.
- **Locking back**: Once updates are finished, click **Lock month** to re-freeze the month's snapshot.
- **Current month locking**: Ongoing months remain unlocked by default until an administrator chooses to freeze them early.

## Document export & mobile/PWA sharing

The application supports direct client-side document compilation and sharing:

- **Direct sharing on mobile & PWA**: When using the application on mobile phones, tablets, or installed as a standalone PWA, clicking **Share / Send PDF** (or exporting CSV/Excel) opens the native operating system share sheet (`navigator.share`). Users can send files directly to WhatsApp, Telegram, Gmail, Google Drive, Slack, or other installed apps without relying on broken mobile browser print dialogs.
- **Desktop fallback**: On desktop browsers, the same buttons trigger instant crisp file downloads.
- **Full A4 formatting**: Regardless of the phone's viewport width, PDFs are compiled using an off-screen container matching standard A4 dimensions (portrait or landscape as appropriate) with UI buttons and controls cleanly omitted.

## Point deductions & penalties

Authorized administrators (and users granted `Manage point deductions`) can deduct points from an employee's score when they violate requirements, fail tasks, or receive disciplinary action:

- **Deducting from Employees tab**: Next to each employee in the team list, click **Deduct** to open the deduction modal.
- **Balance protection**: The modal displays the employee's current earned points, existing deductions, and live available balance. You cannot deduct more points than the available balance (balance cannot drop below zero).
- **"Let It Go" (Pardon)**: If management reviews an infraction and decides to pardon it, you can select *Let It Go*. This records the explanation and incident in the audit trail with 0 points deducted.
- **Audit trail & CSV Export**: **Admin → Point Deductions** provides a complete log of all penalties and pardons with filters by month, employee, and decision type, plus CSV download.
- **Immediate employee notification**: Submitting a deduction automatically sends an in-app notification to the affected user with the deducted amount, justification, and new balance.
- **Monthly report reflection**: Net points, totals, and monthly earnings automatically incorporate deductions.
- **Automatic task-violation deductions appear here too**: the same audit log
  and CSV export also include the system's automatic 5-day task-violation
  penalties (see *Task management & oversight* above), shown with **"System
  (task violation)"** as the authorizing admin and the task it came from in
  the reason. They're a separate record type under the hood — no human admin
  action, so there's nothing to approve — but they count toward the same
  balance and the same "Total Points Deducted" figure.

---

## When something looks wrong

1. **A page is missing from someone's menu** — check their rights in
   Employees.
2. **An action is refused** — the message says what's needed. Rights are
   enforced on the server, so the interface never offers something the
   server would reject.
3. **Figures changed unexpectedly** — check the **Finance trail** (Payments)
   for the employee and month in question; it lays out every entry and
   adjustment behind the total, in order, with who added what and when.
   Also check whether a work type's rate was edited, and whether the month
   is locked.
4. **After a new version is released**, apply any pending database
   migrations (`npm run db:migrate:prod`). If a page returns a server error
   right after an update, that is the first thing to check.
