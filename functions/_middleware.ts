import * as Sentry from '@sentry/cloudflare'
import type { Env } from '../server/env'

// Wraps every Pages Function request (currently just functions/api/) with
// Sentry: request/response context, unhandled-exception capture, and
// performance tracing. Must run first so it can see everything downstream —
// see the "Sentry first" note in @sentry/cloudflare's docs.
//
// Off by default: no SENTRY_DSN means `enabled: false` and this is a no-op.
// Set it with `wrangler pages secret put SENTRY_DSN` (once per environment —
// production and preview each need their own).
//
// sentryPagesPlugin's return type is PagesPluginFunction, not the plain
// PagesFunction Cloudflare's own types expect here — that's a gap in
// @sentry/cloudflare's types, not a real incompatibility (this is the
// pattern documented for functions/_middleware.ts), so it's left uninferred
// rather than annotated against the wrong type.
export const onRequest = [
  Sentry.sentryPagesPlugin<Env>((context) => ({
    dsn: context.env.SENTRY_DSN,
    enabled: Boolean(context.env.SENTRY_DSN),
    // Light sampling: internal team tool, not high-traffic — enough to
    // catch real problems without burning through the quota.
    tracesSampleRate: 0.2,
  })),
]
