import { INSTANCE_URL, RELAY_SECRET, isRelayMode, HDR_RELAY_SECRET } from '@/lib/relay'

/**
 * GET /api/relay/health
 *
 * On remote deployment: pings the instance and reports connectivity.
 * On instance:          reports relay config status.
 */
export async function GET() {
  const info: Record<string, unknown> = {
    mode: isRelayMode ? 'remote' : 'instance',
    relayConfigured: !!RELAY_SECRET,
    timestamp: new Date().toISOString(),
  }

  if (isRelayMode) {
    // Remote deployment → test instance connectivity
    info.instanceUrl = INSTANCE_URL.replace(/\/\/(.+?)@/, '//$REDACTED@')

    try {
      const t0 = Date.now()
      const res = await fetch(`${INSTANCE_URL}/api/relay/health`, {
        headers: { [HDR_RELAY_SECRET]: RELAY_SECRET },
        signal: AbortSignal.timeout(8000),
      })
      const latencyMs = Date.now() - t0

      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        info.instanceReachable = true
        info.instanceLatencyMs = latencyMs
        info.instanceMode = body.mode ?? 'unknown'
      } else {
        info.instanceReachable = false
        info.instanceStatus = res.status
        info.instanceError = await res.text().catch(() => '')
      }
    } catch (err) {
      info.instanceReachable = false
      info.instanceError = String(err)
    }
  } else {
    // Instance side → report readiness
    info.acceptingRelay = !!RELAY_SECRET
  }

  return Response.json(info)
}
