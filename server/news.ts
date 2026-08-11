// News/announcements API handlers.
//
// Rules live in shared/news.ts; this module is the enforcement point — right
// check, expiry math, and the broadcast notification on create.

import type { Employee, Env } from './env'
import { ApiError, json, readJson, todayInTz } from './http'
import { audit, parseRights, requireUser } from './auth'
import { notifyUsers } from './notify'
import { addDays, parseExpiryDays, parseNewsStyle, validateNews, type NewsStyle } from '../shared/news'

export interface NewsRow {
  id: string
  title: string
  body: string | null
  style: NewsStyle
  created_by: string | null
  created_at: string
  expires_at: string
}

function today(env: Env): string {
  return todayInTz(env.TEAM_TZ ?? 'Africa/Accra')
}

/** Admins get the right implicitly, same as almost everything else. */
function canSend(user: Employee): boolean {
  return user.role === 'admin' || parseRights(user).send_announcements
}

const SELECT_NEWS = `
  SELECT n.*, e.name AS created_by_name
    FROM news n
    LEFT JOIN employees e ON e.id = n.created_by`

/**
 * `?manage=1` is the authoring view — every announcement, including expired
 * ones, so a holder of the right can see what they've sent and retract
 * something early. Without it, this is the feed everyone reads: only what's
 * still live.
 *
 * `?style=popup` is the login-interrupt fetch (see NewsPopup.vue) — every
 * live pop-up, for anyone, regardless of role. It exists because pop-ups are
 * otherwise admin-only to browse: the News page itself only ever lists
 * 'feed' announcements for a non-admin, so without this separate path
 * regular employees would stop receiving the interrupt entirely once they
 * can no longer see pop-ups listed. Admins still see both styles through the
 * plain fetch, since they're the ones who can retract a pop-up early.
 */
export async function listNews(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const url = new URL(request.url)
  const manage = url.searchParams.get('manage') === '1'
  const wantPopups = url.searchParams.get('style') === 'popup'
  if (manage && !canSend(user)) throw new ApiError(403, 'You do not have permission for this')

  let sql = `${SELECT_NEWS} WHERE 1 = 1`
  const binds: unknown[] = []
  if (!manage) {
    sql += ' AND n.expires_at >= ?'
    binds.push(today(env))
  }
  if (wantPopups) {
    sql += " AND n.style = 'popup'"
  } else if (user.role !== 'admin') {
    sql += " AND n.style = 'feed'"
  }
  sql += ' ORDER BY n.created_at DESC'

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<NewsRow & { created_by_name: string | null }>()

  const mayDeleteAny = canSend(user)
  return json(
    results.map((n) => {
      // A pop-up reads as an announcement from the organisation, not from a
      // person — hide who sent it from everyone except an admin (who needs
      // it to moderate) or the sender themself. Masked server-side, not just
      // in the UI, so it can't be read off the network response either.
      const hideAuthor = n.style === 'popup' && user.role !== 'admin' && n.created_by !== user.id
      return {
        ...n,
        created_by: hideAuthor ? null : n.created_by,
        created_by_name: hideAuthor ? null : n.created_by_name,
        can_delete: mayDeleteAny && (user.role === 'admin' || n.created_by === user.id),
      }
    }),
  )
}

interface NewsBody {
  title?: string
  body?: string
  style?: string
  days?: number
}

export async function createNews(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (!canSend(user)) throw new ApiError(403, 'You do not have permission to post announcements')
  const body = await readJson<NewsBody>(request)

  const title = (body.title ?? '').trim().slice(0, 200)
  const text = (body.body ?? '').toString().trim().slice(0, 2000) || null
  const issues = validateNews({ title })
  if (issues.length) throw new ApiError(400, issues.map((i) => i.message).join('; '))

  const style = parseNewsStyle(body.style ?? 'feed')
  if (!style) throw new ApiError(400, "style must be 'feed' or 'popup'")
  const isAdmin = user.role === 'admin'
  // A pop-up interrupts everyone's next sign-in — reserved for admins, not
  // every send_announcements holder. Anyone with the right can still post a
  // plain feed announcement.
  if (style === 'popup' && !isAdmin) {
    throw new ApiError(403, 'Only admins can send a pop-up announcement')
  }

  const days = parseExpiryDays(body.days, isAdmin)
  if (days === null) {
    throw new ApiError(
      400,
      isAdmin
        ? 'Expiry must be a whole number of days from 1 to 90'
        : 'Expiry must be a whole number of days from 1 to 7',
    )
  }

  const id = crypto.randomUUID()
  const expiresAt = addDays(today(env), days)
  await env.DB.prepare(
    `INSERT INTO news (id, title, body, style, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, title, text, style, user.id, expiresAt)
    .run()
  await audit(env, user.id, 'create_news', id, { title, style, days })

  // "Send across" — everyone gets it, not just whoever happens to open the
  // News page. In-app only: a broadcast to the whole team is exactly the
  // case where an email/SMS blast per announcement would be unwelcome and,
  // for SMS, billed per person — nobody asked for that channel here.
  const { results } = await env.DB.prepare('SELECT id FROM employees WHERE active = 1 AND id != ?')
    .bind(user.id)
    .all<{ id: string }>()
  await notifyUsers(
    env,
    results.map((r) => r.id),
    {
      kind: style === 'popup' ? 'news_popup' : 'news',
      title: `Announcement: ${title}`,
      body: text ?? undefined,
      inAppOnly: true,
    },
  )

  const created = await env.DB.prepare(`${SELECT_NEWS} WHERE n.id = ?`).bind(id).first()
  return json(created, 201)
}

export async function deleteNews(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(id).first<NewsRow>()
  if (!row) throw new ApiError(404, 'Announcement not found')
  if (!(user.role === 'admin' || row.created_by === user.id)) {
    throw new ApiError(403, 'You can only retract your own announcements')
  }
  await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(id).run()
  await audit(env, user.id, 'delete_news', id, { title: row.title })
  return json({ ok: true })
}
