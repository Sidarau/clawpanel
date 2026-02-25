import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

type CalendarJob = {
  id: string
  name: string
  enabled: boolean
  tz: string
  scheduleKind: 'cron' | 'every' | 'at' | 'unknown'
  scheduleExpr: string
  everyMs?: number
  nextRun: string | null
  isService: boolean
  model: string
}

type CalendarEvent = {
  jobId: string
  name: string
  at: string
  isService: boolean
  scheduleExpr: string
  model: string
}

function isServiceName(name: string): boolean {
  const n = name.toLowerCase()
  return (
    n.includes('heartbeat') ||
    n.includes('board action') ||
    n.includes('youtube') ||
    n.includes('polling') ||
    n.includes('sync') ||
    n.includes('watchdog')
  )
}

function parseHostCronJobs(crontabRaw: string): CalendarJob[] {
  const jobs: CalendarJob[] = []
  const now = new Date()
  const lines = crontabRaw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))

  for (const line of lines) {
    if (line.includes('kb_youtube_poll.py')) {
      const next = new Date(now)
      next.setUTCMinutes(17, 0, 0)
      if (next <= now) next.setUTCHours(next.getUTCHours() + 1)

      jobs.push({
        id: 'host-kb-youtube-poll',
        name: 'KB Drops: YouTube Channel Polling (code)',
        enabled: true,
        tz: 'UTC',
        scheduleKind: 'cron',
        scheduleExpr: '17 * * * *',
        nextRun: next.toISOString(),
        isService: true,
        model: 'code/python3',
      })
    }

    if (line.includes('board-action-processor.py')) {
      const next = new Date(now)
      const minute = next.getUTCMinutes()
      const delta = 5 - (minute % 5 || 5)
      next.setUTCMinutes(minute + delta, 0, 0)

      jobs.push({
        id: 'host-board-action-processor',
        name: 'Board Action Processor (code)',
        enabled: true,
        tz: 'UTC',
        scheduleKind: 'every',
        scheduleExpr: 'every 5m',
        everyMs: 5 * 60 * 1000,
        nextRun: next.toISOString(),
        isService: true,
        model: 'code/python3',
      })
    }
  }

  return jobs
}

function inferCronCadenceMs(expr: string): { stepMs: number; allowedDow?: Set<number> } {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return { stepMs: 24 * 60 * 60 * 1000 }

  const [min, hour, _dom, _month, dow] = parts
  let stepMs = 24 * 60 * 60 * 1000

  if (/^\*\/\d+$/.test(min) && hour === '*') {
    const n = Number(min.split('/')[1])
    stepMs = Math.max(1, n) * 60 * 1000
  } else if (/^\d+$/.test(min) && hour === '*') {
    stepMs = 60 * 60 * 1000
  } else if (/^\d+$/.test(min) && /^\*\/\d+$/.test(hour)) {
    const n = Number(hour.split('/')[1])
    stepMs = Math.max(1, n) * 60 * 60 * 1000
  } else if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    stepMs = 24 * 60 * 60 * 1000
  }

  let allowedDow: Set<number> | undefined
  if (dow && dow !== '*') {
    const vals = dow
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n))
      .map((n) => (n === 7 ? 0 : n))
    if (vals.length) allowedDow = new Set(vals)
  }

  return { stepMs, allowedDow }
}

function expandEvents(job: CalendarJob, nowMs: number, horizonMs: number): CalendarEvent[] {
  if (!job.nextRun) return []

  const first = Date.parse(job.nextRun)
  if (!Number.isFinite(first)) return []

  const events: CalendarEvent[] = []
  const push = (t: number) => {
    if (t < nowMs || t > horizonMs) return
    events.push({
      jobId: job.id,
      name: job.name,
      at: new Date(t).toISOString(),
      isService: job.isService,
      scheduleExpr: job.scheduleExpr,
      model: job.model,
    })
  }

  push(first)

  // Service jobs only once in weekly view (today list still includes them once)
  if (job.isService) return events

  let stepMs = 0
  let allowedDow: Set<number> | undefined

  if (job.scheduleKind === 'every' && (job.everyMs || 0) > 0) {
    stepMs = job.everyMs || 0
  } else if (job.scheduleKind === 'cron') {
    const inferred = inferCronCadenceMs(job.scheduleExpr)
    stepMs = inferred.stepMs
    allowedDow = inferred.allowedDow
  }

  if (stepMs <= 0) return events

  let t = first
  let guard = 0
  while (guard++ < 300) {
    t += stepMs
    if (t > horizonMs) break
    if (allowedDow) {
      const dow = new Date(t).getUTCDay()
      if (!allowedDow.has(dow)) continue
    }
    push(t)
  }

  return events
}

export async function GET() {
  try {
    const home = homedir()

    // Build agent model map + aliases (same precedence as cron-jobs API)
    const configRaw = await readFile(join(home, '.openclaw', 'openclaw.json'), 'utf-8')
    const config = JSON.parse(configRaw)
    const configAgents = config?.agents?.list ?? []
    const defaultModel = config?.agents?.defaults?.model?.primary || 'anthropic/claude-opus-4-6'

    const aliasToModel = new Map<string, string>()
    const modelDefs = config?.agents?.defaults?.models ?? {}
    for (const [model, def] of Object.entries(modelDefs)) {
      const alias = (def as any)?.alias
      if (alias) aliasToModel.set(String(alias), String(model))
    }

    const agentModelMap = new Map<string, string>()
    for (const a of configAgents) {
      if (a.id && a.model) {
        const model = aliasToModel.get(String(a.model)) || String(a.model)
        agentModelMap.set(String(a.id), model)
        agentModelMap.set(String(a.id).replace(/\//g, '-'), model)
      }
    }

    const raw = await readFile(join(home, '.openclaw', 'cron', 'jobs.json'), 'utf-8')
    const data = JSON.parse(raw)
    const rawJobs = data?.jobs ?? (Array.isArray(data) ? data : [])

    const jobs: CalendarJob[] = rawJobs
      .filter((j: any) => j.enabled !== false)
      .map((j: any) => {
        const schedule = j.schedule || {}
        const payload = j.payload || {}
        const kind = String(schedule.kind || 'unknown') as CalendarJob['scheduleKind']
        const expr = kind === 'cron'
          ? String(schedule.expr || '')
          : kind === 'every'
            ? `every ${Math.max(1, Math.round(Number(schedule.everyMs || 0) / 60000))}m`
            : kind === 'at'
              ? String(schedule.at || 'one-shot')
              : 'unknown'

        const nextRunMs = Number(j?.state?.nextRunAtMs || 0)

        const payloadKind = String(payload.kind || '')
        let model = 'code/system-event'
        if (payloadKind !== 'systemEvent') {
          const rawModel = payload.model as string | undefined
          const agentId = String(j.agentId ?? '')
          model = (rawModel && (aliasToModel.get(rawModel) || rawModel)) || agentModelMap.get(agentId) || defaultModel
        }

        return {
          id: String(j.id || ''),
          name: String(j.name || ''),
          enabled: true,
          tz: String(schedule.tz || 'UTC'),
          scheduleKind: kind,
          scheduleExpr: expr,
          everyMs: kind === 'every' ? Number(schedule.everyMs || 0) : undefined,
          nextRun: nextRunMs > 0 ? new Date(nextRunMs).toISOString() : null,
          isService: isServiceName(String(j.name || '')),
          model,
        }
      })

    // Add host-level service jobs
    try {
      const { stdout } = await execFileAsync('crontab', ['-l'], { timeout: 3000 })
      const hostJobs = parseHostCronJobs(stdout || '')
      const ids = new Set(jobs.map((j) => j.id))
      for (const h of hostJobs) if (!ids.has(h.id)) jobs.push(h)
    } catch {}

    if (!jobs.some((j) => j.id === 'service-heartbeat-main')) {
      const next = new Date()
      const m = next.getUTCMinutes()
      const delta = 30 - (m % 30 || 30)
      next.setUTCMinutes(m + delta, 0, 0)
      jobs.push({
        id: 'service-heartbeat-main',
        name: 'Main Heartbeat',
        enabled: true,
        tz: 'UTC',
        scheduleKind: 'every',
        scheduleExpr: 'every 30m',
        everyMs: 30 * 60 * 1000,
        nextRun: next.toISOString(),
        isService: true,
        model: 'openai/gpt-4.1-mini',
      })
    }

    const nowMs = Date.now()
    const horizonMs = nowMs + 7 * 24 * 60 * 60 * 1000

    const events = jobs
      .flatMap((job) => expandEvents(job, nowMs, horizonMs))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

    return Response.json({ jobs, events })
  } catch (err) {
    return Response.json({ error: String(err), jobs: [], events: [] }, { status: 500 })
  }
}
