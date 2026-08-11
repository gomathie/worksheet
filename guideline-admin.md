# OpenSignal Ledger — Admin Guide

Setting up people, rights, work types and the expense workflow — everything on
top of the **User Guide** (Account menu), which still applies to you too:
you log time, tasks and expenses the same way everyone else does.

---

## People and rights

**Employees** — add someone, or edit anyone.

Each person has a **name**, optional **email** and **phone**, a **username and
password** for signing in, an auto-generated **staff code** (`EMP-001`), a
**department**, and a **Reports to** manager — set that last one to make
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
just hidden in the interface.

### The rights

| Right | Grants |
|---|---|
| Add / Edit / Delete own entries | Three separate controls over their own time entries |
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
| Manage tasks | Assign tasks to others and see the whole board |
| Delete tasks | Delete a task that has been assigned to someone else |
| Send announcements | Post to News (pop-up on login is admin-only regardless — see the News section in the User Guide) |

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

## Work types, points and modules

**Settings → Work types & points.**

- Each type is worth **points per unit**. Points × **value per point** = money.
- **Cards** ticked means the type is logged as individual cards rather than a
  typed count (Classification, QAP).
- **Module** groups related types under one heading — Classification and QAP sit
  under *Data Analytics*. Leave blank for a standalone type. It's just a label;
  type the same name on two types and they group together.
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
- **Mark paid** when money goes out; the employee then **confirms receipt**.
- **Trail** — click it next to anyone in the payouts table when a total looks
  off. It lays out every entry and every bonus/reimbursement behind that
  person's figure for the month, in the order it actually counted, each with
  a running total and (for bonuses/reimbursements) who added it and when —
  so "why did this number move" has a direct answer.

## Petty cash administration

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

## Other settings

- **Employee code prefix** — the `EMP-` in `EMP-001`.
- **Departments** and **expense categories** — add, rename, deactivate.
- **Device types** — the telematics device make list, including the queue of
  suggestions from installers. See *Installations & device types* above.
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
- **News** — a shortcut to the News page; posting still needs the Send
  announcements right, and a pop-up specifically is admin-only.

## Activity log

**Reports → Activity** is the administrator audit trail: who did what, when.

The **expense** audit trail is separate and stronger — it is **append-only,
enforced by the database itself**. Edits and deletions of that log are rejected
by SQLite, not merely avoided in code, so a voucher's history cannot be quietly
rewritten.

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
