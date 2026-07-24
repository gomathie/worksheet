import type { Env } from './env'
import type { RateSettings } from '../shared/logic'

// Per-work-type point rates moved to the work_types table in migration 0004;
// settings now only holds the money conversion and currency.
const DEFAULTS: RateSettings = {
  point_value: 1,
  currency: '$',
}

export async function loadSettings(env: Env): Promise<RateSettings> {
  const { results } = await env.DB.prepare(
    'SELECT key, value FROM settings',
  ).all<{ key: string; value: string }>()
  const map = new Map(results.map((r) => [r.key, r.value]))
  return {
    point_value: Number(map.get('point_value') ?? DEFAULTS.point_value),
    currency: map.get('currency') ?? DEFAULTS.currency,
  }
}

export async function saveSettings(env: Env, s: RateSettings): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  await env.DB.batch([
    stmt.bind('point_value', String(s.point_value)),
    stmt.bind('currency', s.currency),
  ])
}
