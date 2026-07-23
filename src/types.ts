import type { MonthlyReport, RateSettings } from '../shared/logic'

export type { MonthlyReport, RateSettings }

export interface Me {
  id: string
  name: string
  email: string | null
  role: 'admin' | 'employee'
  today: string
}

export interface Employee {
  id: string
  name: string
  email: string | null
  role: 'admin' | 'employee'
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

export type ReportPayload = MonthlyReport & {
  settings: RateSettings
  daily_detail: DailyDetailRow[]
}
