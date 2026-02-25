import { readdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

type BucketRange = 'today' | '24h' | 'wtd' | 'mtd'

type ModelUsage = {
  model: string
  tokens: Record<BucketRange, number>
}

const CACHE_TTL_MS = 45_000
let cache: { ts: number; payload: { models: ModelUsage[] } } | null = null

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function startOfUtcWeek(d: Date): number {
  const dayStart = startOfUtcDay(d)
  const day = new Date(dayStart).getUTCDay() // 0=Sun
  const delta = day === 0 ? 6 : day - 1 // Monday-start
  return dayStart - delta * 24 * 60 * 60 * 1000
}

function startOfUtcMonth(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export async function GET() {
  try {
    if (cache && (Date.now() - cache.ts) < CACHE_TTL_MS) {
      return Response.json(cache.payload)
    }

    const now = new Date()
    const nowMs = now.getTime()
    const starts: Record<BucketRange, number> = {
      today: startOfUtcDay(now),
      '24h': nowMs - (24 * 60 * 60 * 1000),
      wtd: startOfUtcWeek(now),
      mtd: startOfUtcMonth(now),
    }

    const minStart = Math.min(...Object.values(starts))

    const home = homedir()
    const agentsDir = join(home, '.openclaw', 'agents')
    const entries = await readdir(agentsDir, { withFileTypes: true })

    const byModel = new Map<string, Record<BucketRange, number>>()

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionsDir = join(agentsDir, entry.name, 'sessions')

      let files: string[] = []
      try {
        files = (await readdir(sessionsDir)).filter((f) => f.endsWith('.jsonl') && !f.endsWith('.lock'))
      } catch {
        continue
      }

      for (const file of files) {
        const filePath = join(sessionsDir, file)
        let raw = ''
        try {
          raw = await readFile(filePath, 'utf-8')
        } catch {
          continue
        }

        const lines = raw.split('\n')
        for (const line of lines) {
          if (!line) continue
          try {
            const obj = JSON.parse(line) as {
              type?: string
              timestamp?: string
              message?: {
                model?: string
                timestamp?: string
                usage?: {
                  totalTokens?: number
                  input?: number
                  output?: number
                }
              }
            }

            if (obj.type !== 'message') continue
            const msg = obj.message
            if (!msg) continue

            const tsRaw = obj.timestamp || msg.timestamp || ''
            const ts = Date.parse(tsRaw)
            if (!Number.isFinite(ts) || ts < minStart) continue

            const usage = msg.usage || {}
            const totalTokens = Number(usage.totalTokens ?? ((usage.input || 0) + (usage.output || 0)))
            if (!Number.isFinite(totalTokens) || totalTokens <= 0) continue

            const model = String(msg.model || 'unknown')
            if (!byModel.has(model)) {
              byModel.set(model, { today: 0, '24h': 0, wtd: 0, mtd: 0 })
            }
            const agg = byModel.get(model)!

            if (ts >= starts.today) agg.today += totalTokens
            if (ts >= starts['24h']) agg['24h'] += totalTokens
            if (ts >= starts.wtd) agg.wtd += totalTokens
            if (ts >= starts.mtd) agg.mtd += totalTokens
          } catch {
            continue
          }
        }
      }
    }

    const models: ModelUsage[] = Array.from(byModel.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => (b.tokens.mtd || 0) - (a.tokens.mtd || 0))

    const payload = { models }
    cache = { ts: Date.now(), payload }
    return Response.json(payload)
  } catch {
    return Response.json({ models: [] })
  }
}
