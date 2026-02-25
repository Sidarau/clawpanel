/**
 * Relay – proxy layer for remote ClawPanel deployments.
 *
 * When INSTANCE_URL is set (e.g. on Vercel), API requests get proxied
 * to the user's OpenClaw Lightsail instance.  On the instance itself
 * INSTANCE_URL is empty → no proxying, routes hit the filesystem directly.
 *
 * Auth: a shared RELAY_SECRET header proves the caller is the user's
 * own deployment.  The remote side validates it in middleware and trusts
 * the forwarded user identity headers.
 */

// ── Config ──────────────────────────────────────────────

/** URL of the OpenClaw instance (set on remote deployments, empty on instance). */
export const INSTANCE_URL = (process.env.INSTANCE_URL || '').replace(/\/+$/, '')

/** Shared secret between the remote deployment and the instance. */
export const RELAY_SECRET = process.env.RELAY_SECRET || ''

/** True when running on a remote deployment that needs proxying. */
export const isRelayMode = !!INSTANCE_URL

/** True on the actual OpenClaw host (no INSTANCE_URL). */
export const isLocalInstance = !INSTANCE_URL

// ── Relay header names ──────────────────────────────────

export const HDR_RELAY_SECRET = 'x-relay-secret'
export const HDR_FWD_EMAIL    = 'x-forwarded-user-email'
export const HDR_FWD_NAME     = 'x-forwarded-user-name'
export const HDR_FWD_SUB      = 'x-forwarded-user-sub'

// ── Paths ───────────────────────────────────────────────

/** Paths served locally even on remote deployments (auth, health, relay meta). */
const LOCAL_ONLY_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/webhook',
  '/api/relay',
]

/** Should this API path be proxied when in relay mode? */
export function shouldProxy(pathname: string): boolean {
  if (!isRelayMode) return false
  if (!pathname.startsWith('/api/')) return false
  return !LOCAL_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

// ── Proxy helper ────────────────────────────────────────

export interface ProxyOpts {
  /** Original incoming request. */
  request: Request
  /** Authenticated user email (from CF JWT or local bypass). */
  userEmail?: string
  /** Authenticated user display name. */
  userName?: string
  /** Authenticated user sub. */
  userSub?: string
}

/**
 * Proxy a request to the OpenClaw instance and return the response.
 * Runs in edge middleware context (Web Fetch API only).
 */
export async function proxyToInstance(opts: ProxyOpts): Promise<Response> {
  const { request, userEmail, userName, userSub } = opts
  const url = new URL(request.url)
  const target = `${INSTANCE_URL}${url.pathname}${url.search}`

  const headers = new Headers()
  // Relay auth
  headers.set(HDR_RELAY_SECRET, RELAY_SECRET)
  // Forwarded identity
  if (userEmail) headers.set(HDR_FWD_EMAIL, userEmail)
  if (userName)  headers.set(HDR_FWD_NAME, userName)
  if (userSub)   headers.set(HDR_FWD_SUB, userSub)
  // Content negotiation
  const ct = request.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      // @ts-expect-error — Cloudflare/Vercel edge supports duplex
      duplex: 'half',
    })

    // Clone essential response headers, skip hop-by-hop
    const resHeaders = new Headers()
    const skipHeaders = new Set([
      'transfer-encoding', 'connection', 'keep-alive',
      'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade',
    ])
    res.headers.forEach((v, k) => {
      if (!skipHeaders.has(k.toLowerCase())) resHeaders.set(k, v)
    })

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

// ── Relay auth validation (on instance side) ────────────

/**
 * Validate an incoming relay request.
 * Returns the forwarded user identity if valid, null otherwise.
 */
export function validateRelayRequest(headers: Headers): {
  email: string
  name: string
  sub: string
} | null {
  if (!RELAY_SECRET) return null
  const secret = headers.get(HDR_RELAY_SECRET)
  if (!secret || secret !== RELAY_SECRET) return null

  const email = headers.get(HDR_FWD_EMAIL) || ''
  if (!email) return null

  return {
    email,
    name: headers.get(HDR_FWD_NAME) || email.split('@')[0],
    sub: headers.get(HDR_FWD_SUB) || email,
  }
}
