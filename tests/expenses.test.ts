import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORKFLOW,
  allowedActions,
  formatVoucherNumber,
  statusAfter,
  statusAfterManagerApproval,
  statusAfterSubmit,
  isApprover,
  PETTY_CASH_CONSUMING_STATUSES,
  OPEN_STATUSES,
  FUNDING_SOURCES,
  FUNDING_SOURCE_LABELS,
  isReimbursable,
  parseFundingSource,
  canSpendFromPettyCash,
  consumesPettyCash,
  movementValue,
  pettyCashBalance,
  daysBetween,
  findPossibleDuplicates,
  isPossibleDuplicate,
  summarize,
  validateAttachment,
  validateVoucher,
  type ExpenseActor,
  type VoucherLike,
} from '../shared/expenses'
import {
  defaultRightsForRole,
  parseDataScope,
  parseRole,
  sanitizeRightsJson,
} from '../server/auth'
import { scopeClause } from '../server/scope'

const TODAY = '2026-07-28'

const employee: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: false,
  can_record: false,
  can_send_for_approval: false,
  can_approve: false,
  is_owner: true,
  is_manager_of_owner: false,
}
const manager: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: true,
  can_record: false,
  can_send_for_approval: false,
  can_approve: false,
  is_owner: false,
  is_manager_of_owner: true,
}
const recorder: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: false,
  can_record: true,
  can_send_for_approval: false,
  can_approve: false,
  is_owner: false,
  is_manager_of_owner: false,
}
// Screens submissions and puts them to an approver; decides nothing.
const screener: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: false,
  can_record: false,
  can_send_for_approval: true,
  can_approve: false,
  is_owner: false,
  is_manager_of_owner: false,
}
// A plain administrator: every right EXCEPT expense approval.
const admin: ExpenseActor = {
  is_admin: true,
  can_create: true,
  can_review: true,
  can_record: true,
  can_send_for_approval: true,
  can_approve: false,
  is_owner: false,
  is_manager_of_owner: false,
}

// An administrator who has also been granted approval authority.
const approver: ExpenseActor = { ...admin, can_approve: true }

// A voucher always represents an expense with no receipt, so a valid one
// always carries the reason and the accepted declaration.
const validVoucher = {
  expense_date: '2026-07-20',
  description: 'Taxi to the client site',
  amount: 40,
  currency: '$',
  payment_method: 'cash',
  missing_receipt_reason: 'Trotro fare, no receipts issued',
  declaration_accepted: true,
}

describe('statusAfterSubmit', () => {
  it('routes to the manager when one exists and the step is required', () => {
    expect(statusAfterSubmit(DEFAULT_WORKFLOW, true)).toBe('submitted')
  })
  it('goes to screening when the employee has no manager', () => {
    expect(statusAfterSubmit(DEFAULT_WORKFLOW, false)).toBe('screening')
  })
  it('goes to screening when the manager step is off', () => {
    // Turning the step off shortens the chain; it must never auto-approve.
    expect(statusAfterSubmit({ require_manager: false }, true)).toBe('screening')
  })
  it('never reaches an approver or an approval without being screened', () => {
    for (const hasManager of [true, false]) {
      for (const require_manager of [true, false]) {
        const landed = statusAfterSubmit({ require_manager }, hasManager)
        expect(landed).not.toBe('admin_approval')
        expect(landed).not.toBe('approved')
        expect(landed).not.toBe('finance_review')
      }
    }
  })
})

describe('statusAfterManagerApproval', () => {
  it('hands to the screening desk, not straight to the approver', () => {
    expect(statusAfterManagerApproval()).toBe('screening')
  })
})

describe('statusAfter', () => {
  it('maps each decision to its next state', () => {
    const w = DEFAULT_WORKFLOW
    expect(statusAfter('start_review', w, true)).toBe('manager_review')
    expect(statusAfter('manager_approve', w, true)).toBe('screening')
    expect(statusAfter('request_approval', w, true)).toBe('admin_approval')
    expect(statusAfter('admin_approve', w, true)).toBe('approved')
    expect(statusAfter('manager_reject', w, true)).toBe('rejected')
    expect(statusAfter('admin_reject', w, true)).toBe('rejected')
    expect(statusAfter('return', w, true)).toBe('draft')
    expect(statusAfter('reopen', w, true)).toBe('draft')
    expect(statusAfter('mark_recorded', w, true)).toBe('recorded')
  })
  it('returns null for non-transition actions', () => {
    expect(statusAfter('edit', DEFAULT_WORKFLOW, true)).toBeNull()
  })
})

describe('allowedActions', () => {
  it('lets the owner edit, submit, and delete a draft', () => {
    const actions = allowedActions({ status: 'draft', reopened: false }, employee)
    expect(actions).toEqual(
      expect.arrayContaining(['edit', 'submit', 'delete', 'add_attachment']),
    )
  })

  it('stops the owner editing once the voucher is submitted', () => {
    const actions = allowedActions({ status: 'submitted', reopened: false }, employee)
    expect(actions).not.toContain('edit')
    expect(actions).not.toContain('submit')
  })

  it('lets a manager decide on a submitted voucher from a direct report', () => {
    const actions = allowedActions({ status: 'submitted', reopened: false }, manager)
    expect(actions).toEqual(
      expect.arrayContaining(['manager_approve', 'manager_reject', 'return', 'start_review']),
    )
  })

  it('refuses a manager who is not the owner\'s manager', () => {
    const stranger: ExpenseActor = { ...manager, is_manager_of_owner: false }
    expect(allowedActions({ status: 'submitted', reopened: false }, stranger)).toEqual([])
  })

  it('never lets a reviewer approve their own voucher', () => {
    const selfApprover: ExpenseActor = {
      ...manager,
      is_owner: true,
      is_manager_of_owner: true,
      can_create: true,
    }
    const actions = allowedActions({ status: 'submitted', reopened: false }, selfApprover)
    expect(actions).not.toContain('manager_approve')
  })

  it('keeps a manager out of the retired finance stage', () => {
    expect(
      allowedActions({ status: 'finance_review', reopened: false }, manager),
    ).toEqual([])
  })

  it('never lets a recorder approve, at any stage', () => {
    for (const status of [
      'submitted',
      'manager_review',
      'finance_review',
      'admin_approval',
      'approved',
    ] as const) {
      const actions = allowedActions({ status, reopened: false }, recorder)
      expect(actions).not.toContain('admin_approve')
      expect(actions).not.toContain('admin_reject')
    }
  })

  it('lets a recorder book a voucher only once it is approved', () => {
    for (const status of [
      'draft',
      'submitted',
      'manager_review',
      'finance_review',
      'admin_approval',
    ] as const) {
      expect(allowedActions({ status, reopened: false }, recorder)).not.toContain(
        'mark_recorded',
      )
    }
    expect(allowedActions({ status: 'approved', reopened: false }, recorder)).toContain(
      'mark_recorded',
    )
  })

  it('gives a recorder nothing to do before approval', () => {
    expect(
      allowedActions({ status: 'admin_approval', reopened: false }, recorder),
    ).toEqual([])
  })

  it('withholds approval from an admin lacking the right', () => {
    // The whole point of approve_expenses: the role alone is not enough.
    const actions = allowedActions({ status: 'admin_approval', reopened: false }, admin)
    expect(actions).not.toContain('admin_approve')
    expect(actions).not.toContain('admin_reject')
  })

  it('grants approval to an admin who holds the right', () => {
    expect(
      allowedActions({ status: 'admin_approval', reopened: false }, approver),
    ).toEqual(expect.arrayContaining(['admin_approve', 'admin_reject', 'return']))
  })

  it('lets an approver clear a voucher left in the retired finance stage', () => {
    expect(
      allowedActions({ status: 'finance_review', reopened: false }, approver),
    ).toContain('admin_approve')
  })

  it('needs both the role and the right to be an approver', () => {
    expect(isApprover(approver)).toBe(true)
    expect(isApprover(admin)).toBe(false)
    expect(isApprover({ ...recorder, can_approve: true })).toBe(false)
  })

  it('freezes an approved voucher for admins until it is reopened', () => {
    const frozen = allowedActions({ status: 'approved', reopened: false }, admin)
    expect(frozen).not.toContain('edit')
    expect(frozen).toContain('reopen')

    const reopened = allowedActions({ status: 'approved', reopened: true }, admin)
    expect(reopened).toContain('edit')
  })

  it('gives a recorded voucher no owner actions', () => {
    expect(allowedActions({ status: 'recorded', reopened: false }, employee)).toEqual([])
  })

  it('withholds create actions from an owner lacking the right', () => {
    const noRight: ExpenseActor = { ...employee, can_create: false }
    expect(allowedActions({ status: 'draft', reopened: false }, noRight)).toEqual([])
  })
})

describe('validateVoucher', () => {
  it('accepts a complete voucher with a receipt', () => {
    expect(validateVoucher(validVoucher, TODAY)).toEqual([])
  })

  it('rejects a zero or negative amount', () => {
    const issues = validateVoucher({ ...validVoucher, amount: 0 }, TODAY)
    expect(issues.map((i) => i.field)).toContain('amount')
  })

  it('rejects a future expense date', () => {
    const issues = validateVoucher({ ...validVoucher, expense_date: '2026-08-01' }, TODAY)
    expect(issues.map((i) => i.message)).toContain('Expense date cannot be in the future')
  })

  it('accepts an expense dated today', () => {
    expect(validateVoucher({ ...validVoucher, expense_date: TODAY }, TODAY)).toEqual([])
  })

  it('requires a description', () => {
    const issues = validateVoucher({ ...validVoucher, description: '   ' }, TODAY)
    expect(issues.map((i) => i.field)).toContain('description')
  })

  it('rejects an unknown payment method', () => {
    const issues = validateVoucher({ ...validVoucher, payment_method: 'crypto' }, TODAY)
    expect(issues.map((i) => i.field)).toContain('payment_method')
  })

  it('always demands a reason for the missing receipt', () => {
    const issues = validateVoucher(
      { ...validVoucher, missing_receipt_reason: '   ' },
      TODAY,
    )
    expect(issues.map((i) => i.field)).toContain('missing_receipt_reason')
  })

  it('always demands the declaration', () => {
    const issues = validateVoucher(
      { ...validVoucher, declaration_accepted: false },
      TODAY,
    )
    expect(issues.map((i) => i.field)).toContain('declaration_accepted')
  })

  it('lets an incomplete draft save but not submit', () => {
    const draft = {
      ...validVoucher,
      missing_receipt_reason: null,
      declaration_accepted: false,
    }
    expect(validateVoucher(draft, TODAY, false)).toEqual([])
    expect(validateVoucher(draft, TODAY, true).length).toBeGreaterThan(0)
  })
})

describe('validateAttachment', () => {
  it('accepts the permitted receipt formats', () => {
    expect(validateAttachment('receipt.pdf', 'application/pdf', 1024)).toEqual([])
    expect(validateAttachment('receipt.JPG', 'image/jpeg', 1024)).toEqual([])
    expect(validateAttachment('scan.png', 'image/png', 1024)).toEqual([])
  })
  it('rejects other extensions', () => {
    expect(validateAttachment('receipt.docx', null, 1024).length).toBe(1)
  })
  it('rejects an empty or oversized file', () => {
    expect(validateAttachment('receipt.pdf', 'application/pdf', 0).length).toBe(1)
    expect(
      validateAttachment('receipt.pdf', 'application/pdf', 11 * 1024 * 1024).length,
    ).toBe(1)
  })
  it('rejects a mismatched content type', () => {
    expect(validateAttachment('receipt.pdf', 'text/html', 1024).length).toBe(1)
  })
})

describe('formatVoucherNumber', () => {
  it('zero-pads the sequence to four digits behind the COH-EXP prefix', () => {
    expect(formatVoucherNumber('2026', 7)).toBe('COH-EXP-2026-0007')
    expect(formatVoucherNumber(2026, 1234)).toBe('COH-EXP-2026-1234')
  })
})

describe('summarize', () => {
  const vouchers: VoucherLike[] = [
    {
      id: '1',
      employee_id: 'a',
      employee_name: 'Ama',
      category_id: 'c1',
      category_name: 'Transport',
      department_id: 'd1',
      department_name: 'Ops',
      expense_date: '2026-07-02',
      amount: 100,
      status: 'recorded',
    },
    {
      id: '2',
      employee_id: 'a',
      employee_name: 'Ama',
      category_id: 'c1',
      category_name: 'Transport',
      department_id: 'd1',
      department_name: 'Ops',
      expense_date: '2026-07-10',
      amount: 50,
      status: 'submitted',
    },
    {
      id: '3',
      employee_id: 'b',
      employee_name: 'Kojo',
      category_id: 'c2',
      category_name: 'Meals',
      department_id: null,
      department_name: null,
      expense_date: '2026-07-15',
      amount: 999,
      status: 'rejected',
    },
    {
      id: '4',
      employee_id: 'b',
      employee_name: 'Kojo',
      category_id: null,
      category_name: null,
      department_id: 'd1',
      department_name: 'Ops',
      expense_date: '2026-06-11',
      amount: 25,
      status: 'approved',
    },
  ]

  const s = summarize(vouchers, '2026-07')

  it('counts each status', () => {
    expect(s.counts.recorded).toBe(1)
    expect(s.counts.submitted).toBe(1)
    expect(s.counts.rejected).toBe(1)
    expect(s.counts.approved).toBe(1)
  })

  it('treats in-flight statuses as pending approval', () => {
    expect(s.pending_approval).toBe(1)
  })

  it('excludes rejected vouchers from money totals', () => {
    // July, minus the rejected 999: 100 + 50
    expect(s.total_this_month).toBe(150)
    // All months, minus rejected: 100 + 50 + 25
    expect(s.total_amount).toBe(175)
  })

  it('buckets by category, employee, and department, largest first', () => {
    expect(s.by_category[0]).toMatchObject({ label: 'Transport', amount: 150, count: 2 })
    expect(s.by_category.map((b) => b.label)).toContain('Uncategorized')
    expect(s.by_employee[0]).toMatchObject({ label: 'Ama', amount: 150 })
    expect(s.by_department[0]).toMatchObject({ label: 'Ops', amount: 175, count: 3 })
  })

  it('handles an empty set', () => {
    const empty = summarize([], '2026-07')
    expect(empty.total_this_month).toBe(0)
    expect(empty.pending_approval).toBe(0)
    expect(empty.by_category).toEqual([])
  })
})

// --------------------------------------------------------- roles & data scope

describe('defaultRightsForRole', () => {
  it('gives an employee no team visibility', () => {
    const r = defaultRightsForRole('employee')
    expect(r.view_dashboard).toBe(false)
    expect(r.view_reports).toBe(false)
    expect(r.review_expenses).toBe(false)
  })

  it('seeds a manager with team visibility and expense review', () => {
    const r = defaultRightsForRole('manager')
    expect(r.view_dashboard).toBe(true)
    expect(r.view_reports).toBe(true)
    expect(r.review_expenses).toBe(true)
  })

  it('never seeds approval authority for any role', () => {
    for (const role of ['employee', 'manager', 'admin'] as const) {
      expect(defaultRightsForRole(role).approve_expenses).toBe(false)
      expect(defaultRightsForRole(role).approve_users).toBe(false)
    }
  })
})

describe('parseRole', () => {
  it('accepts the three known roles', () => {
    expect(parseRole('admin')).toBe('admin')
    expect(parseRole('manager')).toBe('manager')
    expect(parseRole('employee')).toBe('employee')
  })
  it('falls back to employee for anything else', () => {
    // Guards against a client posting role: 'superuser'.
    expect(parseRole('superuser')).toBe('employee')
    expect(parseRole(undefined)).toBe('employee')
    expect(parseRole('')).toBe('employee')
  })
})

describe('parseDataScope', () => {
  it('accepts the four scopes', () => {
    expect(parseDataScope('own')).toBe('own')
    expect(parseDataScope('direct_reports')).toBe('direct_reports')
    expect(parseDataScope('department')).toBe('department')
    expect(parseDataScope('all')).toBe('all')
  })
  it('falls back to the narrowest scope on anything unknown', () => {
    expect(parseDataScope('everything')).toBe('own')
    expect(parseDataScope(null)).toBe('own')
  })
})

describe('scopeClause', () => {
  it('produces no filter when unrestricted', () => {
    expect(scopeClause(null, 'v.employee_id')).toEqual({ sql: '', binds: [] })
  })
  it('produces an IN filter for a list', () => {
    const c = scopeClause(['a', 'b'], 'v.employee_id')
    expect(c.sql).toBe(' AND v.employee_id IN (?,?)')
    expect(c.binds).toEqual(['a', 'b'])
  })
  it('blocks everything rather than falling through on an empty list', () => {
    // A bug that produced [] must never widen access to the whole table.
    expect(scopeClause([], 'v.employee_id').sql).toBe(' AND 1 = 0')
  })
})

describe('sanitizeRightsJson', () => {
  const withApproval = JSON.stringify({
    view_dashboard: true,
    approve_expenses: true,
    approve_users: true,
  })

  it('leaves an admin untouched', () => {
    expect(JSON.parse(sanitizeRightsJson(withApproval, 'admin'))).toMatchObject({
      approve_expenses: true,
      approve_users: true,
    })
  })

  it('strips both approval rights from a manager', () => {
    // Switching Admin -> Manager with the boxes ticked must not persist an
    // authority the API will always refuse.
    const out = JSON.parse(sanitizeRightsJson(withApproval, 'manager'))
    expect(out.approve_expenses).toBe(false)
    expect(out.approve_users).toBe(false)
  })

  it('strips both approval rights from an employee', () => {
    const out = JSON.parse(sanitizeRightsJson(withApproval, 'employee'))
    expect(out.approve_expenses).toBe(false)
    expect(out.approve_users).toBe(false)
  })

  it('keeps every other right intact', () => {
    expect(JSON.parse(sanitizeRightsJson(withApproval, 'manager')).view_dashboard).toBe(
      true,
    )
  })

  it('returns the input unchanged when there is nothing to strip', () => {
    const clean = JSON.stringify({ view_dashboard: true })
    expect(sanitizeRightsJson(clean, 'employee')).toBe(clean)
  })

  it('survives malformed JSON rather than throwing', () => {
    expect(sanitizeRightsJson('not json', 'employee')).toBe('not json')
    expect(sanitizeRightsJson('', 'employee')).toBe('')
  })
})

// ------------------------------------------------------- duplicate detection

describe('duplicate detection', () => {
  const base = {
    id: 'a',
    employee_id: 'e1',
    category_id: 'c1',
    expense_date: '2026-07-20',
    amount: 40,
    status: 'submitted' as const,
  }
  const other = (over: Partial<typeof base> & { id: string }) => ({ ...base, ...over })

  it('measures whole days between dates', () => {
    expect(daysBetween('2026-07-20', '2026-07-23')).toBe(3)
    expect(daysBetween('2026-07-23', '2026-07-20')).toBe(3)
    expect(daysBetween('2026-07-20', '2026-07-20')).toBe(0)
    // across a month boundary
    expect(daysBetween('2026-07-31', '2026-08-01')).toBe(1)
  })

  it('flags the same amount within the window', () => {
    expect(isPossibleDuplicate(base, other({ id: 'b', expense_date: '2026-07-22' }))).toBe(true)
  })

  it('ignores claims outside the window', () => {
    expect(isPossibleDuplicate(base, other({ id: 'b', expense_date: '2026-07-28' }))).toBe(false)
  })

  it('ignores a different amount', () => {
    expect(isPossibleDuplicate(base, other({ id: 'b', amount: 41 }))).toBe(false)
  })

  it('ignores another employee', () => {
    expect(isPossibleDuplicate(base, other({ id: 'b', employee_id: 'e2' }))).toBe(false)
  })

  it('never flags the voucher against itself', () => {
    expect(isPossibleDuplicate(base, { ...base })).toBe(false)
  })

  it('never flags a rejected claim', () => {
    // A rejected claim being refiled is the process working, not a duplicate.
    expect(isPossibleDuplicate(base, other({ id: 'b', status: 'rejected' }))).toBe(false)
    expect(
      isPossibleDuplicate({ ...base, status: 'rejected' }, other({ id: 'b' })),
    ).toBe(false)
  })

  it('tolerates floating-point amounts', () => {
    expect(
      isPossibleDuplicate({ ...base, amount: 0.1 + 0.2 }, other({ id: 'b', amount: 0.3 })),
    ).toBe(true)
  })

  it('collects every match', () => {
    const found = findPossibleDuplicates(base, [
      other({ id: 'b' }),
      other({ id: 'c', expense_date: '2026-07-21' }),
      other({ id: 'd', amount: 99 }),
      other({ id: 'e', status: 'rejected' }),
    ])
    expect(found.map((f) => f.id)).toEqual(['b', 'c'])
  })
})

// ----------------------------------------------------------------- petty cash

describe('petty cash', () => {
  const issue = (amount: number) => ({ type: 'issue' as const, amount })
  const ret = (amount: number) => ({ type: 'return' as const, amount })
  const adj = (amount: number) => ({ type: 'adjustment' as const, amount })

  it('signs movements correctly', () => {
    expect(movementValue(issue(500))).toBe(500)
    expect(movementValue(ret(200))).toBe(-200)
    expect(movementValue(adj(-30))).toBe(-30)
  })

  it('reduces the float by vouchers in play', () => {
    expect(
      pettyCashBalance([issue(500)], [
        { amount: 40, status: 'submitted' },
        { amount: 60, status: 'approved' },
      ]),
    ).toBe(400)
  })

  it('ignores drafts and rejected claims', () => {
    // The money is only accounted for once the claim is actually in play.
    expect(
      pettyCashBalance([issue(500)], [
        { amount: 40, status: 'draft' },
        { amount: 60, status: 'rejected' },
      ]),
    ).toBe(500)
  })

  it('returns the money to the float when a claim is rejected', () => {
    const before = pettyCashBalance([issue(100)], [{ amount: 40, status: 'approved' }])
    const after = pettyCashBalance([issue(100)], [{ amount: 40, status: 'rejected' }])
    expect(before).toBe(60)
    expect(after).toBe(100)
  })

  it('counts every consuming status', () => {
    for (const status of PETTY_CASH_CONSUMING_STATUSES) {
      expect(consumesPettyCash(status)).toBe(true)
      expect(pettyCashBalance([issue(100)], [{ amount: 10, status }])).toBe(90)
    }
    expect(consumesPettyCash('draft')).toBe(false)
    expect(consumesPettyCash('rejected')).toBe(false)
  })

  it('nets returns and adjustments', () => {
    expect(pettyCashBalance([issue(500), ret(100), adj(-25)], [])).toBe(375)
  })

  it('can go negative when overspent', () => {
    expect(
      pettyCashBalance([issue(50)], [{ amount: 80, status: 'approved' }]),
    ).toBe(-30)
  })

  it('rounds to two decimals', () => {
    expect(
      pettyCashBalance([issue(0.1), issue(0.2)], [{ amount: 0.3, status: 'approved' }]),
    ).toBe(0)
  })

  it('allows spending exactly the balance', () => {
    // Comparing floats directly would reject this.
    expect(canSpendFromPettyCash(0.3, 0.1 + 0.2).ok).toBe(true)
    expect(canSpendFromPettyCash(100, 100).ok).toBe(true)
  })

  it('refuses more than is held, and says how much is left', () => {
    const res = canSpendFromPettyCash(40, 60)
    expect(res.ok).toBe(false)
    expect(res.message).toContain('40.00')
  })
})

describe('funding sources', () => {
  it('treats only own-pocket money as reclaimable', () => {
    expect(isReimbursable('own_pocket')).toBe(true)
    for (const s of ['petty_cash', 'office_cash', 'company_account'] as const) {
      expect(isReimbursable(s)).toBe(false)
    }
  })

  it('accepts every declared source and refuses anything else', () => {
    for (const s of FUNDING_SOURCES) expect(parseFundingSource(s)).toBe(s)
    expect(parseFundingSource('cash')).toBeNull()
    expect(parseFundingSource('')).toBeNull()
    expect(parseFundingSource(undefined)).toBeNull()
  })

  it('labels every source, so none renders as a raw key', () => {
    for (const s of FUNDING_SOURCES) {
      expect(FUNDING_SOURCE_LABELS[s]).toBeTruthy()
    }
  })
})

describe('screening stage', () => {
  const inScreening = { status: 'screening' as const, reopened: false }

  it('lets a screener pass a voucher on or send it back', () => {
    const actions = allowedActions(inScreening, screener)
    expect(actions).toEqual(expect.arrayContaining(['request_approval', 'return']))
  })

  it('never lets a screener approve or reject', () => {
    const actions = allowedActions(inScreening, screener)
    expect(actions).not.toContain('admin_approve')
    expect(actions).not.toContain('admin_reject')
    expect(actions).not.toContain('manager_approve')
  })

  it('never lets a screener record, even after approval', () => {
    expect(
      allowedActions({ status: 'approved', reopened: false }, screener),
    ).not.toContain('mark_recorded')
  })

  it('keeps an ordinary employee and a recorder out of the queue', () => {
    expect(allowedActions(inScreening, employee)).toEqual([])
    expect(allowedActions(inScreening, recorder)).toEqual([])
  })

  it('lets an administrator screen, so the queue is never unowned', () => {
    // The right can be held by nobody at all; without this a voucher would
    // strand in screening with no one able to move it.
    expect(allowedActions(inScreening, admin)).toContain('request_approval')
  })

  it('counts as open and as consuming a petty cash float', () => {
    expect(OPEN_STATUSES).toContain('screening')
    expect(consumesPettyCash('screening')).toBe(true)
  })
})
