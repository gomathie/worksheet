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
  max_entries_per_day: number | null // per-employee override; NULL = use global
  leave_allowance: number | null // annual paid-leave days; NULL = not tracked
  active: number
  created_at: string
}

export interface AbsenceRow {
  id: string
  employee_id: string
  work_date: string
  type: string
  note: string | null
  created_by: string | null
  created_at: string
}

export interface WorkTypeRow {
  id: string
  name: string
  points_per_unit: number
  active: number
  position: number
  created_at: string
}

export interface EntryItemRow {
  entry_id: string
  work_type_id: string
  units: number
}

export interface AdjustmentRow {
  id: string
  employee_id: string
  month: string
  type: 'bonus' | 'reimbursement'
  amount: number
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_by: string | null
  created_at: string
  decided_by: string | null
  decided_at: string | null
}

export interface PaymentRow {
  employee_id: string
  month: string
  paid_at: string | null
  paid_by: string | null
  confirmed_at: string | null
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
