import { cpus, totalmem, freemem, loadavg, uptime, hostname, platform, release } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function execOpenClaw(args: string[], timeout = 3000) {
  try {
    // Prefer absolute CLI path to avoid PATH drift in hosted runtime.
    return await execFileAsync('node', ['/usr/lib/node_modules/openclaw/openclaw.mjs', ...args], { timeout })
  } catch {
    // Best-effort fallback for environments with openclaw on PATH.
    return await execFileAsync('openclaw', args, { timeout })
  }
}

export async function GET() {
  try {
    let diskUsedPercent: number | null = null
    let openclawVersion: string | null = null

    // Fast version check (just read binary, no daemon calls)
    try {
      const { stdout } = await execOpenClaw(['--version'], 3000)
      openclawVersion = (stdout || '').trim() || null
    } catch {}

    // Quick disk check
    try {
      const { stdout } = await execFileAsync('df', ['-P', '/'], { timeout: 2000 })
      const lines = stdout.trim().split('\n')
      const row = lines[1]?.trim().split(/\s+/)
      const pct = row?.[4] || ''
      if (pct.endsWith('%')) diskUsedPercent = Number(pct.replace('%', ''))
    } catch {}

    // Infer health from basic checks (fast)
    const healthStatus: 'ok' | 'error' | 'unknown' = openclawVersion ? 'ok' : 'unknown'

    return Response.json({
      host: {
        hostname: hostname(),
        platform: `${platform()} ${release()}`,
      },
      cpu: {
        cores: cpus().length,
        load1: loadavg()[0],
        load5: loadavg()[1],
        load15: loadavg()[2],
      },
      memory: {
        totalMb: Math.round(totalmem() / 1024 / 1024),
        freeMb: Math.round(freemem() / 1024 / 1024),
        usedMb: Math.round((totalmem() - freemem()) / 1024 / 1024),
      },
      disk: {
        rootUsedPercent: diskUsedPercent,
      },
      uptimeSeconds: Math.round(uptime()),
      openclawVersion,
      systemStatus: {
        health: healthStatus,
      },
      now: new Date().toISOString(),
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
