import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

interface CronRun {
  ts: number
  status: string
  summary?: string
  error?: string
  durationMs?: number
  sessionKey?: string
  sessionId?: string
}

function hostJobDetail(jobId: string) {
  if (jobId === 'host-kb-youtube-poll') {
    return {
      id: jobId,
      name: 'KB Drops: YouTube Channel Polling (code)',
      enabled: true,
      agentId: 'host',
      schedule: { kind: 'cron', expr: '17 * * * *', tz: 'UTC' },
      payload: {
        model: 'code/python3',
        explicitModel: 'code/python3',
        modelSource: 'job-payload',
        thinking: 'n/a',
        prompt: 'python3 /home/ubuntu/.openclaw/workspace/scripts/kb_youtube_poll.py',
        editableModel: false,
      },
      delivery: { mode: 'none' },
      state: {},
      runs: [] as CronRun[],
    }
  }

  if (jobId === 'host-board-action-processor') {
    return {
      id: jobId,
      name: 'Board Action Processor (code)',
      enabled: true,
      agentId: 'host',
      schedule: { kind: 'cron', expr: '*/5 * * * *', tz: 'UTC' },
      payload: {
        model: 'code/python3',
        explicitModel: 'code/python3',
        modelSource: 'job-payload',
        thinking: 'n/a',
        prompt: 'python3 /home/ubuntu/.openclaw/workspace/scripts/board-action-processor.py',
        editableModel: false,
      },
      delivery: { mode: 'none' },
      state: {},
      runs: [] as CronRun[],
    }
  }

  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('id')
  if (!jobId) return Response.json({ error: 'Missing id param' }, { status: 400 })

  const hostDetail = hostJobDetail(jobId)
  if (hostDetail) return Response.json(hostDetail)

  try {
    const home = homedir()

    // Read config for defaults / model mapping
    let defaultModel = 'anthropic/claude-opus-4-6'
    const agentModelMap = new Map<string, string>()
    const aliasToModel = new Map<string, string>()
    try {
      const cfgRaw = await readFile(join(home, '.openclaw', 'openclaw.json'), 'utf-8')
      const cfg = JSON.parse(cfgRaw)
      defaultModel =
        cfg?.agents?.defaults?.model?.primary ||
        cfg?.defaults?.model ||
        defaultModel

      const modelDefs = cfg?.agents?.defaults?.models ?? {}
      for (const [model, def] of Object.entries(modelDefs)) {
        const alias = (def as any)?.alias
        if (alias) aliasToModel.set(String(alias), String(model))
      }

      for (const a of cfg?.agents?.list ?? []) {
        if (a.id && a.model) {
          const model = aliasToModel.get(String(a.model)) || String(a.model)
          agentModelMap.set(String(a.id), model)
          agentModelMap.set(String(a.id).replace(/\//g, '-'), model)
        }
      }
    } catch {}

    // Read job config from jobs.json
    const jobsRaw = await readFile(join(home, '.openclaw', 'cron', 'jobs.json'), 'utf-8')
    const jobsData = JSON.parse(jobsRaw)
    const jobs = jobsData?.jobs ?? (Array.isArray(jobsData) ? jobsData : [])
    const job = jobs.find((j: Record<string, unknown>) => j.id === jobId)
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 })

    // Read run history from runs/{jobId}.jsonl
    let runs: CronRun[] = []
    try {
      const runsRaw = await readFile(join(home, '.openclaw', 'cron', 'runs', `${jobId}.jsonl`), 'utf-8')
      const lines = runsRaw.trim().split('\n').filter(Boolean)
      runs = lines.map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter((r): r is CronRun => r !== null)
      // Sort newest first, take last 10
      runs.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      runs = runs.slice(0, 10)
    } catch {}

    // Extract prompt from payload
    const prompt = (job.payload?.message || job.payload?.text || '') as string
    const payloadKind = String(job.payload?.kind || '')
    const explicitModel = job.payload?.model as string | undefined
    const agentModel = agentModelMap.get(String(job.agentId || ''))
    const model =
      payloadKind === 'systemEvent'
        ? 'code/system-event'
        : (explicitModel && (aliasToModel.get(explicitModel) || explicitModel)) ||
          agentModel ||
          defaultModel

    const modelSource = payloadKind === 'systemEvent'
      ? 'system-event'
      : explicitModel
        ? 'job-payload'
        : agentModel
          ? 'agent-default'
          : 'global-default'

    return Response.json({
      id: job.id,
      name: job.name,
      enabled: job.enabled !== false,
      agentId: job.agentId || '',
      schedule: job.schedule,
      payload: {
        model,
        explicitModel: explicitModel || null,
        modelSource,
        editableModel: payloadKind !== 'systemEvent' && !model.startsWith('code/'),
        thinking: job.payload?.thinking || 'default',
        prompt,
      },
      delivery: job.delivery || {},
      state: job.state || {},
      runs,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
