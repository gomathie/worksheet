import type { DailyTotal, MonthlyReport, RateSettings } from '../shared/logic'

export type { MonthlyReport, RateSettings }

export interface Rights {
  add_entries: boolean
  edit_entries: boolean
  delete_entries: boolean
  view_dashboard: boolean
  view_reports: boolean
  view_remuneration: boolean
  view_payslip: boolean
}

export interface WorkTypeInfo {
  id: string
  name: string
  // Admin-only fields; absent for regular employees.
  points_per_unit?: number
  active?: number
  position?: number
}

export interface Me {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  work_types: WorkTypeInfo[]
  entry_limit: number // 0 = unlimited
  today: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  username: string | null
  role: 'admin' | 'employee'
  rights: Rights
  work_type_ids: string[]
  rate_overrides: Record<string, number>
  max_entries_per_day: number | null
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
  units: Record<string, number>
  notes: string | null
}

export interface DailyDetailRow {
  date: string
  employee_id: string
  employee_name: string
  time_start: string
  time_end: string
  hours: number
  units: Record<string, number>
}

// The API strips money fields for non-admin viewers ("limited" scope):
// per-person points/remuneration and money totals are absent, settings only
// carries the currency, and my_summary holds the viewer's own figures.
export interface ReportPerson {
  employee_id: string
  name: string
  days_worked: number
  hours: number
  units: Record<string, number>
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
  work_types: WorkTypeInfo[]
  totals: {
    hours: number
    units: Record<string, number>
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

export interface TrendData {
  employee_id: string
  employee_name: string
  currency: string
  months: string[]
  work_types: WorkTypeInfo[]
  hours: number[]
  units: Record<string, number[]>
  show_money: boolean
  points?: number[]
  remuneration?: number[]
}

export interface MyRemuneration {
  month: string
  employee_id: string
  employee_name: string
  currency: string
  hours: number
  units: Record<string, number>
  work_types: WorkTypeInfo[]
  points: number
  base: number
  bonus: number
  reimbursements: number
  total_due: number
  paid_at: string | null
  confirmed_at: string | null
  adjustments: Adjustment[]
}
