# OpenSignal Ledger — User Guide

A practical guide to using the app day to day: logging your work, tasks,
expenses, leave and pay.

What you can see and do depends on the **rights** an administrator has given
you, so some sections here may not apply. If a page isn't in your menu, you
don't hold the right for it — ask an administrator rather than assuming it's
broken.

---

## Signing in

Log in with the **username and password** an administrator set for you. Once in,
the **Account** menu at the top right holds your name and role, **Edit
profile**, **Change password**, and **Sign out**.

**Edit profile** is where you keep your own **name**, **email** and **phone**
number current — email and phone are what notifications go to (email, and SMS
if an admin has that turned on). Your role and rights are still set by an
administrator.

Tap the **OpenSignal Ledger** masthead at any time to get back to Time Entry.

The **🔔 bell** shows unread notifications — expense decisions, tasks assigned to
you, reimbursement outcomes. Open it to read them, or turn on push notifications
from the same panel so they reach you when the app is closed. On iPhone you must
add the app to your home screen first.

## Logging your time

**Time Entry** is the home page.

1. Check the **date** (defaults to today) and set **time start** and **time
   end**. Hours are worked out for you, and an overnight shift is handled —
   22:00 to 06:00 is eight hours, not minus sixteen. The end time can't be
   more than an hour ahead of right now — a shift that hasn't happened yet
   can't be logged as done.
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

### Telematics installations

If you're assigned **Telematics Installation** work, cards for it work a bit
differently — there's no duplicate warning (several installs of the same device
in a day is normal, not a repeat), and each card asks for:

- **Installation type** — currently just _Telematics device_.
- **Device type** — the make you installed (Teltonika, Concox, ...).
- **New or replacement** — whether this was a fresh install or you swapped out a
  faulty unit. Pick **replacement** and you'll also be asked which make **came
  out**, so the organisation can see which devices fail most often.

**Can't find your device?** Use _Can't find your device? Suggest a device type_
under the card list. It's sent for an administrator to approve — your suggestion
won't appear in the device list until then, so it isn't usable on a card yet.

### The duplicate warning

If you log a card that has **already been done for the same work type on the
same day** — by you or anyone else — you'll see a warning naming who did it,
_before_ anything saves. You can go back and change it, or continue.

**If you continue, the administrators are notified.**

Classifying a card and QAP'ing the same card on the same day is the normal flow
and is never flagged. Genuine rework is fine — the warning exists so it's a
decision rather than an accident.

### Recent entries

Below the form, the month's entries are listed with the **card names** under each
count, so you can see what a day actually was without opening it, and **when it
was logged** (not the same as the shift's date/time — that's when you actually
sat down and entered it). Entries are **grouped by day** — if you logged twice
in one day, you'll see one heading for that date (with the total hours and how
many entries) rather than two unconnected-looking rows. Change the month with
the picker, and **Download CSV** for a copy.

**Editing vs. removing.** With the edit right you can correct an entry or add
to it. Taking something away — removing a card, or lowering a typed count —
needs the delete right as well, same as deleting the entry outright would;
without it, the ✕ next to a card just won't be there, and the card names show
as plain text instead.

## Tasks

**Tasks** is a shared to-do list for work that isn't a time entry or an expense.

- **Anyone can add a task for themselves** — a title, and optionally details, a
  priority and a date you want it done by — or **raise it as a ticket open to
  Everyone** (see below); neither needs a right. Assigning a task to **one
  named person** needs the **Manage tasks** right, since that's putting it on
  someone else's plate specifically.
- Each task gets a short code (**TASK-001**) and a **View** button that opens its
  own page — where status changes, reassignment, and accepting an Everyone task
  all happen directly, with no detour through Edit.
- A task moves **To do → In progress → Done**, or **Cancelled** if it's dropped.
- Anything open and past its date is marked **overdue**. Finished and cancelled
  tasks are never flagged, and a task with no date can't be late.
- Finished tasks hide themselves; tick **Show finished** to see them.

**If someone assigns you a task** you get a notification, and whoever raised it
is told when you finish. You can move it along but **not change its wording** —
otherwise "do X" could quietly become "do Y" and then be marked done. If a task
is wrong, ask the person who raised it to change it.

**Everyone tasks.** Instead of naming one person, anyone can open a task to
**Everyone** — a ticket for the team to pick up rather than an instruction to
somebody in particular. It shows an _Everyone_ badge and sits unclaimed —
visible to the whole team, not just managers — until somebody taps **Accept**,
either from the list or the task's own page. Accepting needs no special right;
after that it behaves exactly like any other task assigned to you, and whoever
raised it is told you took it.

**Deadline reminders.** If you have an open task due today or tomorrow, you'll
get a pop-up when you load the app — up to twice a day, once in the morning and
once in the afternoon — warning that missing a deadline attracts a reduction in
points. **Got it** or **View tasks** dismisses it until the next check.

**Deleting.** Your own to-do list is yours to clear out. But once a task has been
given to someone else it records what was asked of them, so deleting it needs
the **Delete tasks** right. **Prefer Cancel** — it keeps the record and can be
undone.

## News

**News** is where team-wide announcements show up. Anyone can read it; posting
needs the **Send announcements** right (administrators always have it).

- A post is either a plain **Announcement** (sits on the News page for anyone
  with the right to post) or a **Pop-up on login** — **administrators only**.
  A pop-up interrupts everyone with a modal, and keeps re-interrupting every
  few hours for as long as it's still live — not just once — so it's hard to
  miss even if someone leaves a tab open all day. It never says who sent it,
  and it never shows up in the News page's list for you — you'll only ever
  get the pop-up itself.
- Every post **expires on its own** — there is no "leave it up forever" option.
- Whoever posted it (or an administrator) can **retract** it early.

## Expense vouchers

An expense voucher is how you claim for something **where no receipt was
issued**. If you have a receipt, use the normal process instead — a voucher
isn't needed.

### Filing one

**Expenses → New voucher**. Fill in the date, purpose, amount, and:

**Where the money came from** — who actually paid, which is separate from _how_
it was paid (you can be funded from office cash and pay by mobile money):

| Option                      | Use it when                                        |
| --------------------------- | -------------------------------------------------- |
| **My own pocket**           | You paid with your own money and are out of pocket |
| **Petty cash float I hold** | You spent from the float you're holding            |
| **Office cash**             | Cash from the office, not your own float           |
| **Company account / card**  | Paid directly by the organisation                  |

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

- **Manager Review** only applies if you have a _Reports to_ manager set;
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
- Ticking _Paid from the petty cash I am holding_ on a voucher reduces the
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
- **Card Audit** — who classified or QAP'd a given card. Admin Guide has more.
- **Installations** — telematics installation activity by device type and
  action, including which devices get replaced most. Admin Guide has more.

---

## When something looks wrong

1. **A page is missing from the menu** — you don't hold the right. Ask an
   administrator.
2. **An action is refused** — the message says what's needed. Rights are enforced
   on the server, so the interface never offers something the server would
   reject.
3. **Figures changed unexpectedly** — check whether a work type's rate was
   edited, and whether the month is locked. An administrator can check the
   **Finance trail** for the exact reason.
