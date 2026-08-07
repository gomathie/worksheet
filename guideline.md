# OpenSignal Ledger — how to use it

A practical guide to the app, in two parts:

- **[Part 1 — For everyone](#part-1--for-everyone)** — logging your work, tasks,
  expenses, leave and pay.
- **[Part 2 — For administrators](#part-2--for-administrators)** — setting up
  people, rights, work types and the expense workflow.

What you can see and do depends on the **rights** an administrator has given
you, so some sections here may not apply. If a page isn't in your menu, you
don't hold the right for it — ask an administrator rather than assuming it's
broken.

---

# Part 1 — For everyone

## Signing in

Log in with the **username and password** an administrator set for you. Once in,
the **Account** menu at the top right holds your name and role, **Change
password**, and **Sign out**.

Tap the **OpenSignal Ledger** masthead at any time to get back to Time Entry.

The **🔔 bell** shows unread notifications — expense decisions, tasks assigned to
you, reimbursement outcomes. Open it to read them, or turn on push notifications
from the same panel so they reach you when the app is closed. On iPhone you must
add the app to your home screen first.

## Logging your time

**Time Entry** is the home page.

1. Check the **date** (defaults to today) and set **time start** and **time
   end**. Hours are worked out for you, and an overnight shift is handled —
   22:00 to 06:00 is eight hours, not minus sixteen.
2. Record what you did (below).
3. Add **notes** if anything is worth remembering.
4. **Add entry**.

### Work types you type a number into

Some work types are simply counted. Enter the number of units next to the type.

### Card-based work: Classification and QAP

Classification and QAP are grouped under the **Data Analytics** heading and are
logged as **individual cards**, not a single number:

- **+ Add card**, then fill in **card name**, **total audits** and **time
  completed**.
- The count for the day is the **number of cards** you logged. You never type it.
- The card name box **suggests names used before**. Pick one rather than
  retyping. The list is shared between Classification and QAP, so a card you
  classified is offered back when you come to QAP it.
- **Names tidy themselves.** Card names use an underscore, and a space is
  corrected automatically — type `Boost us` and it saves as `Boost_us`. This
  matters: the two used to count as different cards.
- Type a brand-new name freely; it joins the suggestion list once you save.

> **If you hold the "direct counts" right**, you get a plain number box for these
> types instead of the card list.

### The duplicate warning

If you log a card that has **already been done for the same work type on the
same day** — by you or anyone else — you'll see a warning naming who did it,
*before* anything saves. You can go back and change it, or continue.

**If you continue, the administrators are notified.**

Classifying a card and QAP'ing the same card on the same day is the normal flow
and is never flagged. Genuine rework is fine — the warning exists so it's a
decision rather than an accident.

### Recent entries

Below the form, the month's entries are listed with the **card names** under each
count, so you can see what a day actually was without opening it. Change the
month with the picker, and **Download CSV** for a copy.

## Tasks

**Tasks** is a shared to-do list for work that isn't a time entry or an expense.

- **Anyone can add a task for themselves** — a title, and optionally details, a
  priority and a date you want it done by.
- A task moves **To do → In progress → Done**, or **Cancelled** if it's dropped.
- Anything open and past its date is marked **overdue**. Finished and cancelled
  tasks are never flagged, and a task with no date can't be late.
- Finished tasks hide themselves; tick **Show finished** to see them.

**If someone assigns you a task** you get a notification, and whoever raised it
is told when you finish. You can move it along but **not change its wording** —
otherwise "do X" could quietly become "do Y" and then be marked done. If a task
is wrong, ask the person who raised it to change it.

**Deleting.** Your own to-do list is yours to clear out. But once a task has been
given to someone else it records what was asked of them, so deleting it needs
the **Delete tasks** right. **Prefer Cancel** — it keeps the record and can be
undone.

## Expense vouchers

An expense voucher is how you claim for something **where no receipt was
issued**. If you have a receipt, use the normal process instead — a voucher
isn't needed.

### Filing one

**Expenses → New voucher**. Fill in the date, purpose, amount, and:

**Where the money came from** — who actually paid, which is separate from *how*
it was paid (you can be funded from office cash and pay by mobile money):

| Option | Use it when |
|---|---|
| **My own pocket** | You paid with your own money and are out of pocket |
| **Petty cash float I hold** | You spent from the float you're holding |
| **Office cash** | Cash from the office, not your own float |
| **Company account / card** | Paid directly by the organisation |

Only **My own pocket** leaves you owed money — the others already came from the
organisation.

**The declaration is the point.** Because no receipt exists, you must give the
**reason none was issued** and **accept the declaration** before submitting. The
wording is saved onto the voucher as it stood that day, so later edits to the
template can't rewrite what you agreed to.

You can **save as draft** and finish later.

### Claiming own-pocket money back

When you submit an own-pocket voucher you're asked whether to **request a
reimbursement** at the same time. Say yes and the claim is raised for you — no
separate form. It's approved in its own right, and **if the voucher is rejected
the claim is withdrawn with it**.

### What happens next

```
Draft → Submitted → Manager Review → Being Screened → Awaiting Admin Approval
      → Approved → Recorded
```

- **Manager Review** only applies if you have a *Reports to* manager set;
  otherwise it goes straight to screening.
- **Being Screened** is a check before it reaches an approver.
- **Approved** means authorised. **Recorded** means entered in the external
  accounts.
- A voucher can be **returned for more information** at any review stage — it
  comes back to draft with a comment saying what's needed.
- Rejections always carry a reason.

Open any voucher to see where it is and its full decision history. Once
**approved**, a **Download PDF** button gives you a one-page A4 receipt to file.
It isn't available before approval, so an unapproved voucher can never produce a
document that reads like an approved one.

**Duplicate detection:** a claim is flagged if the same person filed another for
the same amount within three days. It's a note to the reviewer, not a block.

**Duplicate a voucher:** one tap copies a voucher into a new draft, for recurring
claims like a weekly fare. Everything carries over except the dates and the
declaration — accepting the declaration is a statement about one specific
expense, so it must be accepted again.

## Petty cash

Only for people given the **petty cash** right.

**Petty Cash** shows your balance, your movements, your open top-up request, and
every voucher charged to your float.

- Your balance is **worked out, never stored**: money issued to you, minus
  vouchers in play. A voucher that's rejected, returned or reopened puts the
  money back automatically.
- Ticking *Paid from the petty cash I am holding* on a voucher reduces the
  balance when you submit.
- A claim **larger than your float is refused at submission** — not while
  drafting, since a top-up may not be recorded yet.
- **Ask for more** with a top-up request (one open at a time). An administrator
  confirms what was actually handed over and how; only the confirmed amount
  reaches your balance, and it may differ from what you asked for.

## Absences and leave

**Absences** records days not worked: **Leave, Sick, Holiday, Unpaid, Other**.
Sick, holiday, unpaid and other are open to everyone; **paid Leave needs the
leave right**. If you have an annual allowance, used and remaining are shown.

## Pay, payslip and reports

What you see here depends on your rights.

- **Payments** — your reimbursement requests and their status, and a
  **confirm receipt** button once an administrator marks you paid. Please confirm
  when the money arrives; it's how payment gets closed off.
- **Payslip** — your own printable statement: work done, base pay, itemised
  bonuses and reimbursements, total due.
- **Dashboard** — the team's output for the month. Money shown here is **only
  ever your own**.
- **Monthly Report** — the fuller per-person report.
- **Trends** — your figures over the last 3, 6 or 12 months.
- **Card Audit** — who classified or QAP'd a given card. See Part 2.

---

# Part 2 — For administrators

Everything in Part 1 applies to you too. This part covers what only
administrators (and holders of specific rights) can do.

## People and rights

**Employees** — add someone, or edit anyone.

Each person has a **name**, optional **email**, a **username and password** for
signing in, an auto-generated **staff code** (`EMP-001`), a **department**, and a
**Reports to** manager — set that last one to make somebody a manager for expense
review.

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
  Exports to CSV.

This is also where a duplicate reported by the entry-form warning ends up, so
it's the place to check when a notification says somebody continued past one.

## Payments

- **Bonuses** — add one with a description; it counts immediately.
- **Reimbursements** — employees request; you approve or reject. Only approved
  ones count. A claim goes `pending → awaiting approval → approved`, with
  screening in between, so what you decide on has already been checked.
- **Mark paid** when money goes out; the employee then **confirms receipt**.

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
- **Email (SMTP)** — point the app at any SMTP server (port 587 STARTTLS or 465
  TLS). The password is write-only; **Send test email** verifies it.
- **Download backup** — a full JSON export.

## Activity log

**Reports → Activity** is the administrator audit trail: who did what, when.

The **expense** audit trail is separate and stronger — it is **append-only,
enforced by the database itself**. Edits and deletions of that log are rejected
by SQLite, not merely avoided in code, so a voucher's history cannot be quietly
rewritten.

---

## When something looks wrong

1. **A page is missing from the menu** — you don't hold the right. Check
   Employees, or ask an administrator.
2. **An action is refused** — the message says what's needed. Rights are enforced
   on the server, so the interface never offers something the server would
   reject.
3. **Figures changed unexpectedly** — check whether a work type's rate was
   edited, and whether the month is locked.
4. **After a new version is released**, an administrator must apply any pending
   database migrations (`npm run db:migrate:prod`). If a page returns a server
   error right after an update, that is the first thing to check.
