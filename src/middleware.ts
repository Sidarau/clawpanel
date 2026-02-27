import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose'
import {
  isRelayMode, shouldProxy, proxyToInstance,
  validateRelayRequest, HDR_RELAY_SECRET,
} from '@/lib/relay'

// ── Cloudflare Access ───────────────────────────────────

const CF_AUD_TAG     = process.env.CF_AUD_TAG     || '7456e63680b60408c57fd682810126fcdfdbfefa62016c9081cd89e260e82d17'
const CF_POLICY_ID   = process.env.CF_POLICY_ID   || '21e69ad4-48ce-49f1-95f6-a07286f3e0a5'
const CF_TEAM_DOMAIN = process.env.CF_TEAM_DOMAIN  || 'zeuglab.cloudflareaccess.com'

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null

function getCloudflareJWKS() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(`https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`))
  }
  return jwksCache
}

function extractJWT(request: NextRequest): string | null {
  return (
    request.headers.get('CF-Access-Jwt-Assertion') ||
    request.cookies.get('CF_Authorization')?.value ||
    null
  )
}

async function validateCloudflareJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getCloudflareJWKS(), {
      audience: CF_AUD_TAG,
      issuer: `https://${CF_TEAM_DOMAIN}`,
    })
    if (CF_POLICY_ID && payload.policies) {
      const policies = payload.policies as string[]
      if (!policies.includes(CF_POLICY_ID)) return null
    }
    return payload
  } catch {
    return null
  }
}

function extractUserFromJWT(payload: JWTPayload) {
  return {
    email: (payload.email as string) || '',
    name: (payload.name as string) || (payload.common_name as string) || '',
    sub: (payload.sub as string) || '',
    groups: (payload.groups as string[]) || [],
  }
}

function buildLoginUrl(request: NextRequest): string {
  if (!CF_TEAM_DOMAIN) return request.url
  return `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/login?redirect_url=${encodeURIComponent(request.url)}`
}

// ── Helpers ─────────────────────────────────────────────

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h.includes('100.93.146.15') ||
    h.includes('localhost') ||
    h.includes('127.0.0.1')
  )
}

const PUBLIC_PATHS = ['/', '/api/auth', '/api/webhook', '/api/health', '/_next', '/static', '/favicon.ico']
const PUBLIC_API   = ['/api/health', '/api/webhook', '/api/auth']

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_API.some(p => pathname.startsWith(p))
  )
}

// ── Middleware ───────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ── 1. Relay proxy mode (remote deployment → instance) ──
  //
  // When INSTANCE_URL is set, we're running on Vercel/Netlify.
  // Proxy eligible API calls to the user's Lightsail instance.
  if (isRelayMode && shouldProxy(pathname)) {
    // Authenticate the user first (CF JWT or skip for private host)
    let userEmail = ''
    let userName = ''
    let userSub = ''

    if (isPrivateHost(host)) {
      userEmail = process.env.LOCAL_DEV_EMAIL || 'alex@zeuglab.com'
      userName  = process.env.LOCAL_DEV_NAME  || 'Alex'
      userSub   = 'local-dev'
    } else {
      const token = extractJWT(request)
      if (!token) return NextResponse.redirect(buildLoginUrl(request))

      const payload = await validateCloudflareJWT(token)
      if (!payload) {
        const res = NextResponse.redirect(buildLoginUrl(request))
        res.cookies.delete('CF_Authorization')
        return res
      }

      const user = extractUserFromJWT(payload)
      userEmail = user.email
      userName  = user.name
      userSub   = user.sub
    }

    return proxyToInstance({ request, userEmail, userName, userSub })
  }

  // ── 2. Private host bypass (Tailscale / localhost) ──
  if (isPrivateHost(host)) {
    const hdrs = new Headers(request.headers)
    hdrs.set('x-user-email', process.env.LOCAL_DEV_EMAIL || 'alex@zeuglab.com')
    hdrs.set('x-user-name',  process.env.LOCAL_DEV_NAME  || 'Alex')
    hdrs.set('x-user-sub',   process.env.LOCAL_DEV_SUB   || 'tailscale-admin')
    return NextResponse.next({ request: { headers: hdrs } })
  }

  // ── 3. Relay acceptance (instance receives proxied request) ──
  //
  // If the request carries a valid X-Relay-Secret, trust forwarded
  // user identity — this request came from our own deployment.
  if (request.headers.get(HDR_RELAY_SECRET)) {
    const relayUser = validateRelayRequest(request.headers)
    if (relayUser) {
      const hdrs = new Headers(request.headers)
      hdrs.set('x-user-email', relayUser.email)
      hdrs.set('x-user-name',  relayUser.name)
      hdrs.set('x-user-sub',   relayUser.sub)
      // Strip the relay secret from downstream
      hdrs.delete(HDR_RELAY_SECRET)
      return NextResponse.next({ request: { headers: hdrs } })
    }
    // Invalid relay secret → reject immediately
    return Response.json({ error: 'Invalid relay credentials' }, { status: 403 })
  }

  // ── 4. Public paths ──
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // ── 5. Cloudflare Access JWT auth ──
  const token = extractJWT(request)
  if (!token) {
    return NextResponse.redirect(buildLoginUrl(request))
  }

  const payload = await validateCloudflareJWT(token)
  if (!payload) {
    const res = NextResponse.redirect(buildLoginUrl(request))
    res.cookies.delete('CF_Authorization')
    return res
  }

  const user = extractUserFromJWT(payload)
  const hdrs = new Headers(request.headers)
  hdrs.set('x-user-email', user.email)
  hdrs.set('x-user-sub',   user.sub)
  if (user.name) hdrs.set('x-user-name', user.name)

  return NextResponse.next({ request: { headers: hdrs } })
}

// ── Route matching ──────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
}

export { extractUserFromJWT, validateCloudflareJWT }
