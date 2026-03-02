/**
 * Relay – proxy layer for remote ClawPanel deployments.
 *
 * Multi-tenant: each user has their own OpenClaw instance stored in KV.
 * Middleware looks up the user's instance config and proxies API requests to it.
 *
 * On the instance itself (local ClawPanel dev server), relay secret validates
 * incoming requests from the Vercel deployment.
 */

// ── Config ──────────────────────────────────────────────

/** Legacy single-tenant override — only used if set. */
export const INSTANCE_URL = (process.env.INSTANCE_URL || '').replace(/\/+$/, '')

/** Legacy relay secret — only used for local instance validation. */
export const RELAY_SECRET = process.env.RELAY_SECRET || ''

/** True on the actual OpenClaw host (no INSTANCE_URL means we're the instance). */
export const isLocalInstance = !INSTANCE_URL

// ── Relay header names ──────────────────────────────────

export const HDR_RELAY_SECRET = 'x-relay-secret'
export const HDR_FWD_EMAIL    = 'x-forwarded-user-email'
export const HDR_FWD_NAME     = 'x-forwarded-user-name'
export const HDR_FWD_SUB      = 'x-forwarded-user-sub'

// ── Paths ───────────────────────────────────────────────

/** API paths that are always served locally (never proxied). */
export const LOCAL_ONLY_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/webhook',
  '/api/relay',
  '/api/instance',  // instance config CRUD lives on Vercel, not instance
]

/** Should this path be proxied to the user's instance? */
export function shouldProxyPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false
  return !LOCAL_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/** Legacy: should proxy based on env var. */
export function shouldProxy(pathname: string): boolean {
  if (!INSTANCE_URL) return false
  return shouldProxyPath(pathname)
}

// ── Proxy helper ────────────────────────────────────────

export interface ProxyOpts {
  /** Original incoming request. */
  request: Request
  /** Authenticated user email. */
  userEmail?: string
  /** Authenticated user display name. */
  userName?: string
  /** Authenticated user sub. */
  userSub?: string
  /** Per-user instance URL (overrides INSTANCE_URL env var). */
  instanceUrl?: string
  /** Per-user relay secret (overrides RELAY_SECRET env var). */
  relaySecret?: string
}

/**
 * Proxy a request to the user's OpenClaw instance.
 * Edge-runtime compatible (Web Fetch API only).
 */
export async function proxyToInstance(opts: ProxyOpts): Promise<Response> {
  const {
    request, userEmail, userName, userSub,
    instanceUrl: dynInstanceUrl,
    relaySecret: dynRelaySecret,
  } = opts

  const baseUrl = (dynInstanceUrl || INSTANCE_URL).replace(/\/+$/, '')
  const secret = dynRelaySecret || RELAY_SECRET

  if (!baseUrl) {
    return Response.json({ error: 'No instance configured' }, { status: 503 })
  }

  const url = new URL(request.url)
  const target = `${baseUrl}${url.pathname}${url.search}`

  const headers = new Headers()
  headers.set(HDR_RELAY_SECRET, secret)
  if (userEmail) headers.set(HDR_FWD_EMAIL, userEmail)
  if (userName)  headers.set(HDR_FWD_NAME, userName)
  if (userSub)   headers.set(HDR_FWD_SUB, userSub)

  const ct = request.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      // @ts-expect-error — edge runtime supports duplex
      duplex: 'half',
    })

    const resHeaders = new Headers()
    const skip = new Set([
      'transfer-encoding', 'connection', 'keep-alive',
      'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade',
    ])
    res.headers.forEach((v, k) => { if (!skip.has(k.toLowerCase())) resHeaders.set(k, v) })

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  } catch (err) {
    return Response.json(
      { error: 'Instance unreachable', detail: String(err) },
      { status: 502 },
    )
  }
}

// ── Instance-side validation ─────────────────────────────

/**
 * Validate an incoming relay request on the local instance.
 * Accepts any relay secret that matches any registered user's secret,
 * or falls back to the env var RELAY_SECRET.
 */
export function validateRelayRequest(
  headers: Headers,
  allowedSecret?: string,
): { email: string; name: string; sub: string } | null {
  const incomingSecret = headers.get(HDR_RELAY_SECRET)
  if (!incomingSecret) return null

  const validSecret = allowedSecret || RELAY_SECRET
  if (!validSecret || incomingSecret !== validSecret) return null

  const email = headers.get(HDR_FWD_EMAIL) || ''
  if (!email) return null

  return {
    email,
    name: headers.get(HDR_FWD_NAME) || email.split('@')[0],
    sub: headers.get(HDR_FWD_SUB) || email,
  }
}
