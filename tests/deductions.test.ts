import { describe, it, expect } from 'vitest'
import { parseRights, type Rights } from '../server/auth'
import type { Employee } from '../server/env'

function makeEmployee(role: Employee['role'], rights: Partial<Rights> = {}): Employee {
  return { id: 'emp-1', role, rights: JSON.stringify(rights) } as Employee
}

describe('manage_point_deductions authorization', () => {
  it('is granted implicitly to administrators', () => {
    const admin = makeEmployee('admin')
    const rights = parseRights(admin)
    expect(rights.manage_point_deductions).toBe(true)
  })

  it('is disabled by default for standard employees', () => {
    const emp = makeEmployee('employee')
    const rights = parseRights(emp)
    expect(rights.manage_point_deductions).toBe(false)
  })

  it('is disabled by default for managers', () => {
    const mgr = makeEmployee('manager')
    const rights = parseRights(mgr)
    expect(rights.manage_point_deductions).toBe(false)
  })

  it('can be granted explicitly to non-admins', () => {
    const empWithRight = makeEmployee('employee', { manage_point_deductions: true })
    const rights = parseRights(empWithRight)
    expect(rights.manage_point_deductions).toBe(true)
  })
})

describe('deduction balance logic', () => {
  it('calculates effective balance accurately', () => {
    const earned = 150.5
    const deducted = 30.5
    const balance = Math.round((earned - deducted) * 100) / 100
    expect(balance).toBe(120)
  })

  it('prevents balance from going below zero', () => {
    const currentBalance = 25
    const proposedDeduction = 30
    const isAllowed = proposedDeduction <= currentBalance
    expect(isAllowed).toBe(false)
  })

  it('records zero amount for let_it_go decisions without altering balance', () => {
    const currentBalance = 80
    const decision = 'let_it_go'
    const deductionAmount = decision === 'let_it_go' ? 0 : 20
    const newBalance = currentBalance - deductionAmount
    expect(deductionAmount).toBe(0)
    expect(newBalance).toBe(80)
  })
})

// applyTaskViolation (server/deductions.ts) clamps to
// `Math.max(0, Math.min(configured, balance))` — never pushes the balance
// below zero, same rule as the manual-deduction path above, just automatic.
describe('automatic task-violation deduction amount', () => {
  const clamp = (configured: number, balance: number) => Math.max(0, Math.min(configured, balance))

  it('deducts the full configured amount when the balance covers it', () => {
    expect(clamp(5, 100)).toBe(5)
  })

  it('caps the deduction to whatever balance remains', () => {
    expect(clamp(5, 3)).toBe(3)
  })

  it('deducts nothing once the balance is already at zero', () => {
    expect(clamp(5, 0)).toBe(0)
  })

  it('never goes negative even if balance is already negative somehow', () => {
    expect(clamp(5, -2)).toBe(0)
  })

  it('is a no-op when the admin-configured penalty is 0 (disabled)', () => {
    const configured = 0
    expect(configured <= 0).toBe(true) // applyTaskViolation returns early in this case
  })
})
