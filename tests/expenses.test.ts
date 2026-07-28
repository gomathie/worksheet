import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORKFLOW,
  allowedActions,
  formatVoucherNumber,
  statusAfter,
  statusAfterManagerApproval,
  statusAfterSubmit,
  summarize,
  validateAttachment,
  validateVoucher,
  type ExpenseActor,
  type VoucherLike,
} from '../shared/expenses'

const TODAY = '2026-07-28'

const employee: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: false,
  can_finance: false,
  is_owner: true,
  is_manager_of_owner: false,
}
const manager: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: true,
  can_finance: false,
  is_owner: false,
  is_manager_of_owner: true,
}
const finance: ExpenseActor = {
  is_admin: false,
  can_create: true,
  can_review: false,
  can_finance: true,
  is_owner: false,
  is_manager_of_owner: false,
}
const admin: ExpenseActor = {
  is_admin: true,
  can_create: true,
  can_review: true,
  can_finance: true,
  is_owner: false,
  is_manager_of_owner: false,
}

const validVoucher = {
  expense_date: '2026-07-20',
  description: 'Taxi to the client site',
  amount: 40,
  currency: '$',
  payment_method: 'cash',
  receipt_available: true,
}

describe('statusAfterSubmit', () => {
  it('routes to the manager when one exists and the step is required', () => {
    expect(statusAfterSubmit(DEFAULT_WORKFLOW, true)).toBe('submitted')
  })
  it('skips to finance when the employee has no manager', () => {
    expect(statusAfterSubmit(DEFAULT_WORKFLOW, false)).toBe('finance_review')
  })
  it('skips the manager step when the workflow disables it', () => {
    expect(
      statusAfterSubmit({ require_manager: false, require_finance: true }, true),
    ).toBe('finance_review')
  })
  it('approves immediately when both steps are off', () => {
    expect(
      statusAfterSubmit({ require_manager: false, require_finance: false }, true),
    ).toBe('approved')
  })
})

describe('statusAfterManagerApproval', () => {
  it('hands off to finance when finance review is on', () => {
    expect(statusAfterManagerApproval(DEFAULT_WORKFLOW)).toBe('finance_review')
  })
  it('approves outright when finance review is off', () => {
    expect(
      statusAfterManagerApproval({ require_manager: true, require_finance: false }),
    ).toBe('approved')
  })
})

describe('statusAfter', () => {
  it('maps each decision to its next state', () => {
    const w = DEFAULT_WORKFLOW
    expect(statusAfter('start_review', w, true)).toBe('manager_review')
    expect(statusAfter('manager_approve', w, true)).toBe('finance_review')
    expect(statusAfter('finance_approve', w, true)).toBe('approved')
    expect(statusAfter('manager_reject', w, true)).toBe('rejected')
    expect(statusAfter('finance_reject', w, true)).toBe('rejected')
    expect(statusAfter('return', w, true)).toBe('draft')
    expect(statusAfter('reopen', w, true)).toBe('draft')
    expect(statusAfter('mark_paid', w, true)).toBe('paid')
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

  it('keeps a manager out of the finance stage', () => {
    expect(
      allowedActions({ status: 'finance_review', reopened: false }, manager),
    ).toEqual([])
  })

  it('lets finance verify and later mark paid', () => {
    expect(
      allowedActions({ status: 'finance_review', reopened: false }, finance),
    ).toEqual(expect.arrayContaining(['finance_approve', 'finance_reject', 'return']))
    expect(allowedActions({ status: 'approved', reopened: false }, finance)).toContain(
      'mark_paid',
    )
  })

  it('freezes an approved voucher for admins until it is reopened', () => {
    const frozen = allowedActions({ status: 'approved', reopened: false }, admin)
    expect(frozen).not.toContain('edit')
    expect(frozen).toContain('reopen')

    const reopened = allowedActions({ status: 'approved', reopened: true }, admin)
    expect(reopened).toContain('edit')
  })

  it('gives a paid voucher no owner actions', () => {
    expect(allowedActions({ status: 'paid', reopened: false }, employee)).toEqual([])
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

  it('demands a reason and a declaration when no receipt exists', () => {
    const issues = validateVoucher(
      { ...validVoucher, receipt_available: false },
      TODAY,
    )
    const fields = issues.map((i) => i.field)
    expect(fields).toContain('missing_receipt_reason')
    expect(fields).toContain('declaration_accepted')
  })

  it('passes once the reason and declaration are supplied', () => {
    expect(
      validateVoucher(
        {
          ...validVoucher,
          receipt_available: false,
          missing_receipt_reason: 'Trotro fare, no receipts issued',
          declaration_accepted: true,
        },
        TODAY,
      ),
    ).toEqual([])
  })

  it('lets an incomplete draft save but not submit', () => {
    const draft = { ...validVoucher, receipt_available: false }
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
  it('zero-pads the sequence to four digits', () => {
    expect(formatVoucherNumber('2026', 7)).toBe('EV-2026-0007')
    expect(formatVoucherNumber(2026, 1234)).toBe('EV-2026-1234')
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
      status: 'paid',
      receipt_available: 1,
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
      receipt_available: 0,
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
      receipt_available: 0,
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
      receipt_available: 1,
    },
  ]

  const s = summarize(vouchers, '2026-07')

  it('counts each status', () => {
    expect(s.counts.paid).toBe(1)
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

  it('counts every voucher filed without a receipt', () => {
    expect(s.missing_receipt_count).toBe(2)
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
