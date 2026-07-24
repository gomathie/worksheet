import type { DailyTotal, MonthlyReport, RateSettings } from '../shared/logic'

export type { MonthlyReport, RateSettings }

export interface Rights {
  add_entries: boolean
  edit_entries: boolean
  delete_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
}

export interface Me {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  today: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  has_password?: number
  active: number
  created_at?: string
}

export interface Entry {
  id: string
  employee_id: string
  employee_name?: string
  work_date: string
  time_start: string
  time_end: string
  hours: number
  classifications: number
  qap: number
  notes: string | null
}

export interface DailyDetailRow {
  date: string
  employee_id: string
  employee_name: string
  time_start: string
  time_end: string
  hours: number
  classifications: number
  qap: number
}

// The API strips money fields for non-admin viewers ("limited" scope):
// per-person points/remuneration and money totals are absent, settings only
// carries the currency, and my_summary holds the viewer's own figures.
export interface ReportPerson {
  employee_id: string
  name: string
  days_worked: number
  hours: number
  classifications: number
  qap: number
  points?: number
  remuneration?: number
  bonus?: number
  reimbursements?: number
  total_due?: number
  paid?: boolean
  confirmed?: boolean
}

export interface ReportPayload {
  month: string
  scope: 'full' | 'limited'
  totals: {
    hours: number
    classifications: number
    qap: number
    days_worked: number
    points?: number
    remuneration?: number
    bonus?: number
    reimbursements?: number
    total_due?: number
  }
  per_person: ReportPerson[]
  daily_totals: DailyTotal[]
  settings: { currency: string } & Partial<RateSettings>
  daily_detail: DailyDetailRow[]
  my_summary?: {
    points: number
    remuneration: number
    bonus: number
    reimbursements: number
    total_due: number
    paid: boolean
    confirmed: boolean
  }
}

export interface Adjustment {
  id: string
  employee_id: string
  employee_name?: string
  month: string
  type: 'bonus' | 'reimbursement'
  amount: number
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface MyRemuneration {
  month: string
  currency: string
  hours: number
  classifications: number
  qap: number
  points: number
  base: number
  bonus: number
  reimbursements: number
  total_due: number
  paid_at: string | null
  confirmed_at: string | null
  adjustments: Adjustment[]
}
