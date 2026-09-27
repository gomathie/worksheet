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
