// Minimal SMTP client + notification helpers for Cloudflare Workers.
//
// Uses the runtime `cloudflare:sockets` API. Submission ports only:
//   465 -> implicit TLS; 587 (or other) -> STARTTLS. Port 25 is blocked by
// Cloudflare and won't work. Auth is AUTH LOGIN (username/password).
import { connect } from 'cloudflare:sockets'
import type { Env } from './env'

export interface SmtpConfig {
  enabled: boolean
  host: string
  port: number
  user: string
  pass: string
  from: string
  from_name: string
}

const SMTP_KEYS = [
  'smtp_enabled',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'smtp_from_name',
] as const

export async function loadSmtp(env: Env): Promise<SmtpConfig> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${SMTP_KEYS.map(() => '?').join(',')})`,
  )
    .bind(...SMTP_KEYS)
    .all<{ key: string; value: string }>()
  const m = new Map(results.map((r) => [r.key, r.value]))
  return {
    enabled: m.get('smtp_enabled') === '1',
    host: m.get('smtp_host') ?? '',
    port: Number(m.get('smtp_port') ?? 587),
    user: m.get('smtp_user') ?? '',
    pass: m.get('smtp_pass') ?? '',
    from: m.get('smtp_from') ?? '',
    from_name: m.get('smtp_from_name') ?? 'OpenSignal Ledger',
  }
}

export async function saveSmtp(env: Env, cfg: Partial<SmtpConfig>): Promise<void> {
  const stmt = env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  const ops = []
  if (cfg.enabled !== undefined) ops.push(stmt.bind('smtp_enabled', cfg.enabled ? '1' : '0'))
  if (cfg.host !== undefined) ops.push(stmt.bind('smtp_host', cfg.host))
  if (cfg.port !== undefined) ops.push(stmt.bind('smtp_port', String(cfg.port)))
  if (cfg.user !== undefined) ops.push(stmt.bind('smtp_user', cfg.user))
  // Only overwrite the password when a non-empty value is supplied.
  if (cfg.pass) ops.push(stmt.bind('smtp_pass', cfg.pass))
  if (cfg.from !== undefined) ops.push(stmt.bind('smtp_from', cfg.from))
  if (cfg.from_name !== undefined) ops.push(stmt.bind('smtp_from_name', cfg.from_name))
  if (ops.length) await env.DB.batch(ops)
}

// ---------------------------------------------------------------- SMTP client

const CRLF = '\r\n'

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin)
}

class SmtpSession {
  private reader!: ReadableStreamDefaultReader<Uint8Array>
  private writer!: WritableStreamDefaultWriter<Uint8Array>
  private decoder = new TextDecoder()
  private encoder = new TextEncoder()
  private pending = ''

  constructor(private socket: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; startTls?: () => unknown }) {
    this.bind()
  }

  private bind() {
    this.reader = this.socket.readable.getReader()
    this.writer = this.socket.writable.getWriter()
  }

  rebindAfterTls(newSocket: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }) {
    this.socket = newSocket as never
    this.pending = ''
    this.bind()
  }

  async read(): Promise<{ code: number; text: string }> {
    // Read until the buffer contains a complete reply (last line "NNN ...").
    while (true) {
      const lines = this.pending.split(CRLF)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]
        if (/^\d{3} /.test(line)) {
          const collected = lines.slice(0, i + 1).join('\n')
          this.pending = lines.slice(i + 1).join(CRLF)
          return { code: Number(line.slice(0, 3)), text: collected }
        }
      }
      const { value, done } = await this.reader.read()
      if (done) {
        const code = Number((this.pending.match(/^\d{3}/) ?? ['0'])[0])
        return { code, text: this.pending }
      }
      this.pending += this.decoder.decode(value, { stream: true })
    }
  }

  async write(line: string): Promise<void> {
    await this.writer.write(this.encoder.encode(line + CRLF))
  }

  async expect(codes: number[], context: string): Promise<{ code: number; text: string }> {
    const reply = await this.read()
    if (!codes.includes(reply.code)) {
      throw new Error(`SMTP ${context} failed: ${reply.text.trim() || 'no response'}`)
    }
    return reply
  }

  async close(): Promise<void> {
    try {
      await this.writer.close()
    } catch {
      // ignore
    }
  }
}

export interface MailMessage {
  to: string
  subject: string
  body: string
}

/** Send one plain-text email. Throws on any SMTP failure. */
export async function sendMail(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  if (!cfg.host || !cfg.from) throw new Error('SMTP host and from-address are required')
  const implicitTls = cfg.port === 465

  const socket = connect(
    { hostname: cfg.host, port: cfg.port },
    { secureTransport: implicitTls ? 'on' : 'starttls', allowHalfOpen: false },
  )
  const session = new SmtpSession(socket as never)

  const run = async () => {
    await session.expect([220], 'greeting')
    await session.write(`EHLO ${cfg.host}`)
    await session.expect([250], 'EHLO')

    if (!implicitTls) {
      await session.write('STARTTLS')
      await session.expect([220], 'STARTTLS')
      const secure = (socket as unknown as { startTls: () => never }).startTls()
      session.rebindAfterTls(secure)
      await session.write(`EHLO ${cfg.host}`)
      await session.expect([250], 'EHLO (TLS)')
    }

    if (cfg.user) {
      await session.write('AUTH LOGIN')
      await session.expect([334], 'AUTH')
      await session.write(b64(cfg.user))
      await session.expect([334], 'AUTH user')
      await session.write(b64(cfg.pass))
      await session.expect([235], 'AUTH password')
    }

    await session.write(`MAIL FROM:<${cfg.from}>`)
    await session.expect([250], 'MAIL FROM')
    await session.write(`RCPT TO:<${msg.to}>`)
    await session.expect([250, 251], 'RCPT TO')
    await session.write('DATA')
    await session.expect([354], 'DATA')

    const headers = [
      `From: ${cfg.from_name} <${cfg.from}>`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ].join(CRLF)
    // Dot-stuff lines beginning with '.' per RFC 5321.
    const safeBody = msg.body.replace(/\r?\n/g, CRLF).replace(/\n\./g, '\n..')
    await session.write(`${headers}${CRLF}${CRLF}${safeBody}${CRLF}.`)
    await session.expect([250], 'message body')
    await session.write('QUIT')
  }

  try {
    // Guard against a hung connection.
    await Promise.race([
      run(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 15000)),
    ])
  } finally {
    await session.close()
  }
}

// ------------------------------------------------------------- notifications

/** Send without throwing — notifications must never break the core action. */
export async function notify(env: Env, to: string | null, subject: string, body: string): Promise<void> {
  if (!to) return
  try {
    const cfg = await loadSmtp(env)
    if (!cfg.enabled) return
    await sendMail(cfg, { to, subject, body })
  } catch (e) {
    console.error('email notify failed:', e)
  }
}

export async function adminEmails(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT email FROM employees WHERE role = 'admin' AND active = 1 AND email IS NOT NULL",
  ).all<{ email: string }>()
  return results.map((r) => r.email).filter(Boolean)
}
