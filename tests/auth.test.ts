import { describe, it, expect } from 'vitest'
import { currentSession, parseRights, type SessionPayload } from '../server/auth'
import type { Employee, Env } from '../server/env'

describe('login_as_others right', () => {
  it('is granted to administrators by role', () => {
    const admin: Employee = { role: 'admin', rights: '{}' } as Employee
    expect(parseRights(admin).login_as_others).toBe(true)
  })

  it('is false by default for regular employees', () => {
    const emp: Employee = { role: 'employee', rights: '{}' } as Employee
    expect(parseRights(emp).login_as_others).toBe(false)
  })

  it('can be explicitly granted to a non-admin employee', () => {
    const emp: Employee = {
      role: 'employee',
      rights: JSON.stringify({ login_as_others: true }),
    } as Employee
    expect(parseRights(emp).login_as_others).toBe(true)
  })
})

describe('currentSession helper', () => {
  function mockEnv(sessionStore: Record<string, string>): Env {
    return {
      SESSIONS: {
        get: async (key: string) => sessionStore[key] ?? null,
      },
    } as unknown as Env
  }

  function mockRequest(token?: string): Request {
    const headers = new Headers()
    if (token) headers.set('cookie', `ledger_session=${token}`)
    return new Request('http://localhost/api/me', { headers })
  }

  it('returns null when no session cookie is provided', async () => {
    const req = mockRequest()
    const env = mockEnv({})
    const sess = await currentSession(req, env)
    expect(sess).toBeNull()
  })

  it('returns null when session is not in KV store', async () => {
    const req = mockRequest('non-existent-token')
    const env = mockEnv({})
    const sess = await currentSession(req, env)
    expect(sess).toBeNull()
  })

  it('returns null when session JSON is corrupted', async () => {
    const req = mockRequest('bad-token')
    const env = mockEnv({ 'session:bad-token': '{invalid-json' })
    const sess = await currentSession(req, env)
    expect(sess).toBeNull()
  })

  it('parses a standard user session without impersonation', async () => {
    const req = mockRequest('valid-token-1')
    const payload: SessionPayload = { employee_id: 'emp-101' }
    const env = mockEnv({ 'session:valid-token-1': JSON.stringify(payload) })
    const sess = await currentSession(req, env)
    expect(sess).not.toBeNull()
    expect(sess?.token).toBe('valid-token-1')
    expect(sess?.payload.employee_id).toBe('emp-101')
    expect(sess?.payload.impersonated_by).toBeUndefined()
  })

  it('parses an impersonated session carrying original admin ID', async () => {
    const req = mockRequest('impersonated-token')
    const payload: SessionPayload = {
      employee_id: 'emp-target',
      impersonated_by: 'admin-original',
    }
    const env = mockEnv({ 'session:impersonated-token': JSON.stringify(payload) })
    const sess = await currentSession(req, env)
    expect(sess).not.toBeNull()
    expect(sess?.token).toBe('impersonated-token')
    expect(sess?.payload.employee_id).toBe('emp-target')
    expect(sess?.payload.impersonated_by).toBe('admin-original')
  })
})
