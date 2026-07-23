export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  TEAM_TZ?: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  username: string | null
  password_hash: string | null
  role: 'admin' | 'employee'
  rights: string // JSON — see Rights in auth.ts
  active: number
  created_at: string
}

export interface EntryRow {
  id: string
  employee_id: string
  work_date: string
  time_start: string
  time_end: string
  hours: number
  classifications: number
  qap: number
  notes: string | null
  created_at: string
  updated_at: string
}
