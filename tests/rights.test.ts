import { describe, it, expect } from 'vitest'
import { canSeeOwnPay, parseRights, type Rights } from '../server/auth'
import type { Employee } from '../server/env'

/** A stored employee row carrying just the rights under test. */
function person(role: Employee['role'], rights: Partial<Rights>): Employee {
  return { role, rights: JSON.stringify(rights) } as Employee
}

describe('view_points exclusivity', () => {
  it('grants points on their own when no pay right is held', () => {
    const r = parseRights(person('employee', { view_points: true }))
    expect(r.view_points).toBe(true)
    expect(canSeeOwnPay(r)).toBe(false)
  })

  it('drops points when view_remuneration is also stored', () => {
    const r = parseRights(person('employee', { view_points: true, view_remuneration: true }))
    expect(r.view_points).toBe(false)
    expect(canSeeOwnPay(r)).toBe(true)
  })

  it('drops points when view_payslip is also stored', () => {
    const r = parseRights(person('employee', { view_points: true, view_payslip: true }))
    expect(r.view_points).toBe(false)
  })

  // view_payslip stands in for view_remuneration on rows written before the
  // split, so it must suppress points through that path too.
  it('drops points for a legacy payslip-only row', () => {
    const r = parseRights(person('manager', { view_points: true, view_payslip: true }))
    expect(r.view_remuneration).toBe(true)
    expect(r.view_points).toBe(false)
  })

  it('never lets a non-admin hold points and pay together, whatever is stored', () => {
    for (const stored of [
      { view_points: true },
      { view_points: true, view_remuneration: true },
      { view_points: true, view_payslip: true },
      { view_points: true, view_remuneration: true, view_payslip: true },
      { view_remuneration: true },
      {},
    ]) {
      const r = parseRights(person('employee', stored))
      expect(r.view_points && canSeeOwnPay(r)).toBe(false)
    }
  })

  it('exempts the admin role — it sees the full equation', () => {
    const r = parseRights(person('admin', {}))
    expect(r.view_points).toBe(true)
    expect(canSeeOwnPay(r)).toBe(true)
  })

  it('defaults points off for a row predating the right', () => {
    expect(parseRights(person('employee', { view_reports: true })).view_points).toBe(false)
  })
})
