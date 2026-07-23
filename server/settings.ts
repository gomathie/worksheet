import type { Env } from './env'
import type { RateSettings } from '../shared/logic'

const DEFAULTS: RateSettings = {
  points_per_classification: 1,
  points_per_qap: 1,
  point_value: 1,
  currency: '$',
}

export async function loadSettings(env: Env): Promise<RateSettings> {
  const { results } = await env.DB.prepare(
    'SELECT key, value FROM settings',
  ).all<{ key: string; value: string }>()
  const map = new Map(results.map((r) => [r.key, r.value]))
  return {
    points_per_classification: Number(
      map.get('points_per_classification') ?? DEFAULTS.points_per_classification,
    ),
    points_per_qap: Number(map.get('points_per_qap') ?? DEFAULTS.points_per_qap),
    point_value: Number(map.get('point_value') ?? DEFAULTS.point_value),
    currency: map.get('currency') ?? DEFAULTS.currency,
  }
}

export async function saveSettings(env: Env, s: RateSettings): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  await env.DB.batch([
    stmt.bind('points_per_classification', String(s.points_per_classification)),
    stmt.bind('points_per_qap', String(s.points_per_qap)),
    stmt.bind('point_value', String(s.point_value)),
    stmt.bind('currency', s.currency),
  ])
}
