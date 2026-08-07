// mnotify SMS client + notification helpers.
//
// mnotify (https://mnotify.com) "Quick" bulk SMS endpoint. Docs:
// https://readthedocs.mnotify.com/#tag/SMS/operation/campaign/sms_quick
//
// Auth is a `key` query param (the account's API key); the sender ID is a
// registered short name/alphanumeric ID, not a phone number.
import type { Env } from './env'

export interface SmsConfig {
  enabled: boolean
  api_key: string
  sender_id: string
}

const SMS_KEYS = ['sms_enabled', 'sms_api_key', 'sms_sender_id'] as const

export async function loadSms(env: Env): Promise<SmsConfig> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${SMS_KEYS.map(() => '?').join(',')})`,
  )
    .bind(...SMS_KEYS)
    .all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  return {
    enabled: m.get('sms_enabled') === '1',
    api_key: m.get('sms_api_key') ?? '',
    sender_id: m.get('sms_sender_id') ?? '',
  }
}

export async function saveSms(env: Env, cfg: Partial<SmsConfig>): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  const ops = []
  if (cfg.enabled !== undefined) ops.push(stmt.bind('sms_enabled', cfg.enabled ? '1' : '0'))
  // Only overwrite the key when a non-empty value is supplied, same as the SMTP password.
  if (cfg.api_key) ops.push(stmt.bind('sms_api_key', cfg.api_key))
  if (cfg.sender_id !== undefined) ops.push(stmt.bind('sms_sender_id', cfg.sender_id))
  if (ops.length) await env.DB.batch(ops)
}

// ------------------------------------------------------------------ mnotify

const MNOTIFY_QUICK_SMS_URL = 'https://api.mnotify.com/api/sms/quick'

/** Strip everything but digits — spaces, dashes, a leading "+", parens. Not a
 * reformat to a specific country code; enter numbers the way mnotify expects
 * for your account (e.g. Ghana local format like 0241234567). */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

export interface MnotifyResponse {
  status?: string
  code?: string | number
  message?: string
  // A "success" HTTP reply doesn't guarantee the carrier actually delivered
  // the message — mnotify accepts the request and reports outcome here. When
  // present, surface it to the admin (see testSms in functions/api/[[route]].ts)
  // so an unregistered sender ID or empty wallet is visible without needing
  // to dig through logs: mnotify's own delivery is out of our control, but
  // this is the one signal their API gives us about it.
  summary?: {
    total_sent?: number
    total_rejected?: number
    contact_count?: number
    credit_used?: number
    credit_left?: number
  }
}

/** Send one SMS. Throws (with mnotify's own message where available) on any
 * non-success reply — callers that must not fail the caller's action should
 * use `notifySms` instead, which swallows errors. Returns mnotify's parsed
 * response on success, for callers that want to surface its delivery summary. */
export async function sendSms(
  cfg: SmsConfig,
  to: string,
  message: string,
): Promise<MnotifyResponse> {
  if (!cfg.api_key) throw new Error('mnotify API key is required')
  if (!cfg.sender_id) throw new Error('mnotify sender ID is required')
  const recipient = digitsOnly(to)
  if (!recipient) throw new Error('No valid recipient phone number')

  const url = `${MNOTIFY_QUICK_SMS_URL}?key=${encodeURIComponent(cfg.api_key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: [recipient],
      sender: cfg.sender_id,
      message,
      is_schedule: false,
      schedule_date: '',
    }),
  })

  let data: MnotifyResponse = {}
  try {
    data = await res.json()
  } catch {
    // Non-JSON body — fall through, !res.ok below still catches HTTP failures.
  }
  if (!res.ok || (data.status && data.status !== 'success')) {
    throw new Error(data.message || `mnotify request failed (HTTP ${res.status})`)
  }
  return data
}

// ------------------------------------------------------------- notifications

/** Send without throwing — notifications must never break the action that
 * triggered them. No-ops when SMS is disabled or there's no recipient. */
export async function notifySms(env: Env, to: string | null, message: string): Promise<void> {
  if (!to) return
  try {
    const cfg = await loadSms(env)
    if (!cfg.enabled) return
    await sendSms(cfg, to, message)
  } catch (e) {
    console.error('sms notify failed:', e)
  }
}
