import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { isRelayMode, INSTANCE_URL, RELAY_SECRET, HDR_RELAY_SECRET } from '@/lib/relay'

/**
 * GET /api/relay/config
 *
 * Returns instance configuration needed by the frontend:
 *   - Gateway WebSocket URL
 *   - Relay mode status
 *   - Instance hostname
 *
 * On remote deployment: proxies to instance (via middleware).
 * On instance:          reads from local openclaw.json.
 */
export async function GET() {
  if (isRelayMode) {
    // Remote deployment — proxy to instance
    try {
      const res = await fetch(`${INSTANCE_URL}/api/relay/config`, {
        headers: { [HDR_RELAY_SECRET]: RELAY_SECRET },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return Response.json({ error: 'Instance error' }, { status: 502 })
      const body = await res.json()
      return Response.json({ ...body, relayMode: true, instanceUrl: INSTANCE_URL })
    } catch (err) {
      return Response.json({ error: 'Instance unreachable', detail: String(err) }, { status: 502 })
    }
  }

  // Instance side — read from local config
  try {
    const cfgPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = await readFile(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)

    const gwPort = cfg.gateway?.port ?? 18889
    const gwMode = cfg.gateway?.mode ?? 'local'

    // Build WebSocket URL hints
    // The actual public URL depends on user's network setup (Tailscale/tunnel/public IP).
    // We provide local values; the frontend uses these as defaults.
    const wsLocal = `ws://127.0.0.1:${gwPort}`
    const wsHintsSet = new Set<string>()

    // Check allowed origins for external WS URLs
    const origins: string[] = cfg.gateway?.controlUi?.allowedOrigins || []
    for (const origin of origins) {
      if (origin.includes('.ts.net') || origin.includes('.tailf')) {
        // Tailscale serve URL — likely has a :8443 gateway proxy
        const m = origin.match(/^(wss?|https?):\/\/([^/:]+)/)
        if (m) wsHintsSet.add(`wss://${m[2]}:8443`)
      }
    }

    // Read Tailscale hostname if available
    let tailscaleHost = ''
    try {
      const tsStatus = await fetch('http://127.0.0.1:41112/localapi/v0/status', {
        headers: { 'Authorization': 'Bearer unused' },
      })
      if (tsStatus.ok) {
        const ts = await tsStatus.json()
        tailscaleHost = ts.Self?.DNSName?.replace(/\.$/, '') || ''
        if (tailscaleHost) {
          wsHintsSet.add(`wss://${tailscaleHost}:8443`)
        }
      }
    } catch { /* Tailscale API not available */ }

    return Response.json({
      relayMode: false,
      gateway: {
        port: gwPort,
        mode: gwMode,
        wsLocal,
        wsHints: Array.from(wsHintsSet),
        tailscaleHost,
      },
      auth: {
        mode: cfg.gateway?.auth?.mode ?? 'token',
        allowTailscale: cfg.gateway?.auth?.allowTailscale ?? false,
      },
    })
  } catch (err) {
    return Response.json({ error: 'Failed to read config', detail: String(err) }, { status: 500 })
  }
}
