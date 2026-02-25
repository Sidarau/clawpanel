import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export async function GET() {
  let port = 18889
  let token = ''

  try {
    const raw = await readFile(join(homedir(), '.openclaw', 'openclaw.json'), 'utf-8')
    const cfg = JSON.parse(raw)
    port = cfg?.gateway?.port ?? 18889
    token = cfg?.gateway?.auth?.token ?? ''
  } catch {}

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
      headers,
    })
    clearTimeout(timeout)

    // If we get any response, gateway is online
    let uptime: number | null = null
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('json')) {
      try {
        const data = await res.json()
        uptime = data?.uptime ?? data?.health?.uptime ?? null
      } catch {}
    }

    return Response.json({ status: 'online', port, uptime })
  } catch {
    // Try a simple TCP-level check — if the port is listening, gateway is online
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok || res.status < 500) {
        return Response.json({ status: 'online', port, uptime: null })
      }
    } catch {}

    return Response.json({ status: 'offline', port, uptime: null })
  }
}
