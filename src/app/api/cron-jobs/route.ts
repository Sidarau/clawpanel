import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface CronJobResponse {
  id: string
  name: string
  enabled: boolean
  schedule: string
  tz: string
  model: string
  status: 'active' | 'error' | 'disabled'
  lastRun: string | null
  nextRun: string | null
  consecutiveErrors: number
  agentId: string
}

function formatSchedule(schedule: Record<string, unknown>): string {
  if (schedule.kind === 'cron') return String(schedule.expr || '')
  if (schedule.kind === 'every') return `every ${Math.max(1, Math.round(Number(schedule.everyMs || 0) / 60000))}m`
  if (schedule.kind === 'at') return 'one-shot'
  return 'unknown'
}

function parseHostCronJobs(crontabRaw: string): CronJobResponse[] {
  const jobs: CronJobResponse[] = []
  const lines = crontabRaw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))

  for (const line of lines) {
    if (line.includes('kb_youtube_poll.py')) {
      jobs.push({
        id: 'host-kb-youtube-poll',
        name: 'KB Drops: YouTube Channel Polling (code)',
        enabled: true,
        schedule: 'hourly (:17)',
        tz: 'UTC',
        model: 'code/python3',
        status: 'active',
        lastRun: null,
        nextRun: null,
        consecutiveErrors: 0,
        agentId: 'host',
      })
    }

    if (line.includes('board-action-processor.py')) {
      jobs.push({
        id: 'host-board-action-processor',
        name: 'Board Action Processor (code)',
        enabled: true,
        schedule: 'every 5m',
        tz: 'UTC',
        model: 'code/python3',
        status: 'active',
        lastRun: null,
        nextRun: null,
        consecutiveErrors: 0,
        agentId: 'host',
      })
    }
  }

  return jobs
}

export async function GET() {
  try {
    const home = homedir()

    const configRaw = await readFile(join(home, '.openclaw', 'openclaw.json'), 'utf-8')
    const config = JSON.parse(configRaw)
    const configAgents = config?.agents?.list ?? []
    const defaultModel =
      config?.agents?.defaults?.model?.primary ||
      config?.defaults?.model ||
      'anthropic/claude-opus-4-6'

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

    const jobs: CronJobResponse[] = rawJobs.map((j: Record<string, unknown>) => {
      const enabled = j.enabled !== false
      const state = (j.state ?? {}) as Record<string, unknown>
      const schedule = (j.schedule ?? {}) as Record<string, unknown>
      const payload = (j.payload ?? {}) as Record<string, unknown>
      const errors = Number(state.consecutiveErrors ?? 0)

      let status: 'active' | 'error' | 'disabled'
      if (!enabled) status = 'disabled'
      else if (errors > 0) status = 'error'
      else status = 'active'

      const payloadKind = String(payload.kind || '')
      let model: string

      if (payloadKind === 'systemEvent') {
        model = 'code/system-event'
      } else {
        const rawModel = payload.model as string | undefined
        const agentId = String(j.agentId ?? '')
        model =
          (rawModel && (aliasToModel.get(rawModel) || rawModel)) ||
          agentModelMap.get(agentId) ||
          defaultModel
      }

      const lastRunMs = state.lastRunAtMs as number | undefined
      const nextRunMs = state.nextRunAtMs as number | undefined

      return {
        id: String(j.id || ''),
        name: String(j.name || ''),
        enabled,
        schedule: formatSchedule(schedule),
        tz: (schedule.tz as string) ?? 'UTC',
        model,
        status,
        lastRun: lastRunMs ? new Date(lastRunMs).toISOString() : null,
        nextRun: nextRunMs ? new Date(nextRunMs).toISOString() : null,
        consecutiveErrors: errors,
        agentId: String(j.agentId ?? ''),
      }
    })

    // Add host-level code cron jobs so UI reflects code-only automations
    try {
      const { stdout } = await execFileAsync('crontab', ['-l'], { timeout: 3000 })
      const hostJobs = parseHostCronJobs(stdout || '')
      const existingIds = new Set(jobs.map(j => j.id))
      for (const h of hostJobs) {
        if (!existingIds.has(h.id)) jobs.push(h)
      }
    } catch {
      // no host crontab or unavailable; ignore
    }

    return Response.json({ jobs })
  } catch {
    return Response.json({ jobs: [] })
  }
}
