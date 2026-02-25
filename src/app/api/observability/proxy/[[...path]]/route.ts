import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const CLAWMETRY_PORT = 8900
const CLAWMETRY_HOST = '127.0.0.1'

async function getGatewayConfig(): Promise<{ token: string; port: number }> {
  try {
    const cfgPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = await readFile(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)
    return {
      token: String(cfg?.gateway?.auth?.token || ''),
      port: Number(cfg?.gateway?.port || 18889),
    }
  } catch {
    return { token: '', port: 18889 }
  }
}

async function configureClawmetry(token: string, port: number): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(`http://${CLAWMETRY_HOST}:${CLAWMETRY_PORT}/api/gw/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, url: `http://127.0.0.1:${port}` }),
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Proxy ClawMetry API endpoints to enable embedded UI components.
 * Routes: /api/observability/proxy/{overview|sessions|costs|flow|agents|crons|summary|health}
 */
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path?.join('/') || ''
  const allowed = new Set([
    'overview',
    'sessions',
    'crons',
    'usage',
    'health',
    'system-health',
  ])

  if (!allowed.has(path)) {
    return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 })
  }

  const url = new URL(req.url)
  const gw = await getGatewayConfig()
  const token = gw.token
  if (token && !url.searchParams.has('token')) {
    // ClawMetry accepts bearer or ?token; send both for compatibility.
    url.searchParams.set('token', token)
  }
  const query = url.searchParams.toString()
  const target = `http://${CLAWMETRY_HOST}:${CLAWMETRY_PORT}/api/${path}${query ? `?${query}` : ''}`

  try {
    let res = await fetch(target, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })

    // First-run ClawMetry often returns 401 needsSetup until /api/gw/config is set.
    if (res.status === 401 && token) {
      const body = await res.json().catch(() => ({} as any))
      if (body?.needsSetup) {
        const configured = await configureClawmetry(token, gw.port)
        if (configured) {
          res = await fetch(target, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
          })
        }
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `ClawMetry error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to reach ClawMetry: ${String(e)}` },
      { status: 503 }
    )
  }
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path?.join('/') || ''
  const allowed = new Set([
    'gw/invoke',
    'gw/rpc',
  ])

  if (!allowed.has(path)) {
    return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 })
  }

  const gw = await getGatewayConfig()
  const token = gw.token
  const target = `http://${CLAWMETRY_HOST}:${CLAWMETRY_PORT}/api/${path}`
  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to reach ClawMetry: ${String(e)}` },
      { status: 503 }
    )
  }
}
