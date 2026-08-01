// Web Push, sent straight from the Worker with no third-party service.
//
// Deliberately payload-less: we send an empty push, the service worker wakes,
// calls /api/notifications, and shows the newest unread one. That has two
// benefits — no aes128gcm payload encryption to implement and get wrong, and
// nothing about an expense ever passes through Apple's or Google's push
// infrastructure. The cost is one extra fetch on the device when a push lands.
//
// Signing is VAPID (RFC 8292): an ES256 JWT naming the push service as
// audience, plus the raw public key, in the Authorization header.

import type { Env } from './env'

const VAPID_PUBLIC = 'vapid_public_key'
const VAPID_PRIVATE = 'vapid_private_key'
const VAPID_SUBJECT = 'vapid_subject'

// ------------------------------------------------------------------ base64url

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlFromString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s))
}

// -------------------------------------------------------------- key material

interface VapidKeys {
  publicKey: string // base64url, raw uncompressed point (65 bytes)
  privateJwk: JsonWebKey
  subject: string
}

async function readSetting(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>()
  return row?.value ?? null
}

async function writeSettings(env: Env, pairs: [string, string][]): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  await env.DB.batch(pairs.map(([k, v]) => stmt.bind(k, v)))
}

/**
 * The instance's VAPID keypair, generated on first use and then reused.
 * Regenerating would invalidate every existing subscription, so this only
 * ever creates keys when none exist.
 */
export async function vapidKeys(env: Env): Promise<VapidKeys> {
  const [pub, priv, subject] = await Promise.all([
    readSetting(env, VAPID_PUBLIC),
    readSetting(env, VAPID_PRIVATE),
    readSetting(env, VAPID_SUBJECT),
  ])
  if (pub && priv) {
    return {
      publicKey: pub,
      privateJwk: JSON.parse(priv) as JsonWebKey,
      subject: subject || 'mailto:admin@example.com',
    }
  }

  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  // The Workers typings widen exportKey to ArrayBuffer | JsonWebKey; the
  // format argument determines which, so narrow it here.
  const rawPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  )
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  const publicKey = b64urlFromBytes(rawPublic)

  await writeSettings(env, [
    [VAPID_PUBLIC, publicKey],
    [VAPID_PRIVATE, JSON.stringify(jwk)],
  ])
  return { publicKey, privateJwk: jwk, subject: subject || 'mailto:admin@example.com' }
}

/** The public key the browser needs in order to subscribe. */
export async function vapidPublicKey(env: Env): Promise<string> {
  return (await vapidKeys(env)).publicKey
}

// ---------------------------------------------------------------- VAPID JWT

async function signJwt(keys: VapidKeys, audience: string): Promise<string> {
  const header = b64urlFromString(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64urlFromString(
    JSON.stringify({
      aud: audience,
      // Push services reject anything more than 24h out; 12h is comfortable.
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: keys.subject,
    }),
  )
  const key = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(`${header}.${body}`),
    ),
  )
  // WebCrypto already emits the raw r||s pair VAPID expects.
  return `${header}.${body}.${b64urlFromBytes(signature)}`
}

// --------------------------------------------------------------- delivery

interface SubscriptionRow {
  id: string
  endpoint: string
}

/**
 * Wake every live device for these employees. Never throws: a push failing is
 * not a reason to fail the approval that triggered it.
 */
export async function pushToEmployees(env: Env, employeeIds: string[]): Promise<void> {
  const ids = [...new Set(employeeIds)].filter(Boolean)
  if (ids.length === 0) return

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint FROM push_subscriptions
        WHERE failed_at IS NULL
          AND employee_id IN (${ids.map(() => '?').join(',')})`,
    )
      .bind(...ids)
      .all<SubscriptionRow>()
    if (results.length === 0) return

    const keys = await vapidKeys(env)
    const now = new Date().toISOString()

    await Promise.all(
      results.map(async (sub) => {
        try {
          const audience = new URL(sub.endpoint).origin
          const jwt = await signJwt(keys, audience)
          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
              TTL: '86400',
              // No payload: the worker fetches the detail itself.
              'Content-Length': '0',
            },
          })
          if (res.status === 404 || res.status === 410) {
            // The subscription is gone for good — retire it so we stop trying.
            await env.DB.prepare(
              'UPDATE push_subscriptions SET failed_at = ? WHERE id = ?',
            )
              .bind(now, sub.id)
              .run()
          } else if (res.ok) {
            await env.DB.prepare(
              'UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?',
            )
              .bind(now, sub.id)
              .run()
          } else {
            console.error('push failed', res.status, await res.text().catch(() => ''))
          }
        } catch (e) {
          console.error('push send error:', e)
        }
      }),
    )
  } catch (e) {
    console.error('pushToEmployees failed:', e)
  }
}

// ------------------------------------------------------------ subscriptions

export async function saveSubscription(
  env: Env,
  employeeId: string,
  endpoint: string,
): Promise<void> {
  // Re-subscribing on the same device reuses the endpoint; move it to this
  // employee and clear any earlier failure.
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, employee_id, endpoint)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       employee_id = excluded.employee_id,
       failed_at = NULL`,
  )
    .bind(crypto.randomUUID(), employeeId, endpoint)
    .run()
}

export async function removeSubscription(env: Env, endpoint: string): Promise<void> {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
    .bind(endpoint)
    .run()
}
