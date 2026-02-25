import { existsSync } from 'fs'
import { access, readdir, readFile, stat } from 'fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'os'
import { join } from 'path'

interface AgentInfo {
  id: string
  name: string
  model: string
  hasSessions: boolean
  group: string
  activity: 'active' | 'queued' | 'idle' | 'stale'
  lastActiveAt: string | null
  runningSteps: number
  queuedSteps: number
  scheduledJobs: number
}

interface WorkflowHealth {
  id: string
  status: 'running' | 'failed' | 'completed' | 'idle'
  activeRuns: number
  runningSteps: number
  queuedSteps: number
  failedRuns: number
  completedRuns: number
  lastRunStatus: string | null
  lastRunAt: string | null
  lastTask: string | null
  lastFailedStep: string | null
  lastError: string | null
}

const ACTIVE_WINDOW_MS = 45 * 60 * 1000
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000
const ANTFARM_DB = join(homedir(), '.openclaw', 'antfarm', 'antfarm.db')

function formatName(id: string): string {
  const base = id.includes('/') ? id.split('/').pop()! : id
  if (base === 'main') return 'Eve'
  return base
    .replace(/[-_]/g, ' ')
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase())
}

function normalizeAgentId(id: string): string {
  return id.replace(/\//g, '-')
}

function getGroup(id: string): string {
  if (id.includes('/')) return id.split('/')[0]
  const parts = id.split('-')
  if (parts.length >= 3) {
    const roles = ['developer', 'planner', 'reviewer', 'verifier', 'tester', 'setup', 'fixer', 'investigator', 'pr', 'triager', 'scanner', 'prioritizer']
    if (roles.includes(parts[parts.length - 1])) return parts.slice(0, -1).join('-')
  }
  return 'core'
}

type RuntimeByAgent = Map<string, { runningSteps: number; queuedSteps: number }>

type RuntimeByWorkflow = Map<string, {
  activeRuns: number
  runningSteps: number
  queuedSteps: number
  failedRuns: number
  completedRuns: number
  lastRunStatus: string | null
  lastRunAtMs: number
  lastTask: string | null
  lastRunId: string | null
  lastFailedStep: string | null
  lastError: string | null
}>

function toMs(input: string | null | undefined): number {
  const raw = String(input || '').trim()
  if (!raw) return 0
  const isoish = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`
  const ms = Date.parse(isoish)
  return Number.isFinite(ms) ? ms : 0
}

function loadRuntimeStats(): { byAgent: RuntimeByAgent; byWorkflow: RuntimeByWorkflow } {
  const byAgent: RuntimeByAgent = new Map()
  const byWorkflow: RuntimeByWorkflow = new Map()

  if (!existsSync(ANTFARM_DB)) return { byAgent, byWorkflow }

  try {
    const db = new DatabaseSync(ANTFARM_DB, { readOnly: true })

    const runRows = db.prepare('SELECT id, workflow_id, status, updated_at, task FROM runs ORDER BY updated_at DESC').all() as Array<{
      id: string
      workflow_id: string
      status: string
      updated_at: string
      task: string
    }>

    for (const row of runRows) {
      const key = row.workflow_id
      if (!byWorkflow.has(key)) {
        byWorkflow.set(key, {
          activeRuns: 0,
          runningSteps: 0,
          queuedSteps: 0,
          failedRuns: 0,
          completedRuns: 0,
          lastRunStatus: null,
          lastRunAtMs: 0,
          lastTask: null,
          lastRunId: null,
          lastFailedStep: null,
          lastError: null,
        })
      }

      const agg = byWorkflow.get(key)!
      const status = String(row.status || '').toLowerCase()
      if (status === 'running') agg.activeRuns += 1
      if (status === 'failed' || status === 'error') agg.failedRuns += 1
      if (status === 'completed' || status === 'done') agg.completedRuns += 1

      const ts = toMs(row.updated_at)
      // First row per workflow is the latest due to ORDER BY
      if (!agg.lastRunId) {
        agg.lastRunAtMs = ts
        agg.lastRunStatus = row.status || null
        agg.lastRunId = row.id
        agg.lastTask = (row.task || '').trim() || null
      }
    }

    const stepRows = db.prepare(`
      SELECT s.agent_id AS agent_id, s.status AS step_status, r.workflow_id AS workflow_id
      FROM steps s
      JOIN runs r ON r.id = s.run_id
      WHERE r.status = 'running'
    `).all() as Array<{ agent_id: string; step_status: string; workflow_id: string }>

    for (const row of stepRows) {
      const agentId = normalizeAgentId(row.agent_id)
      if (!byAgent.has(agentId)) byAgent.set(agentId, { runningSteps: 0, queuedSteps: 0 })

      const a = byAgent.get(agentId)!
      const st = String(row.step_status || '').toLowerCase()
      if (st === 'running') a.runningSteps += 1
      if (st === 'pending' || st === 'waiting') a.queuedSteps += 1

      if (!byWorkflow.has(row.workflow_id)) {
        byWorkflow.set(row.workflow_id, {
          activeRuns: 0,
          runningSteps: 0,
          queuedSteps: 0,
          failedRuns: 0,
          completedRuns: 0,
          lastRunStatus: null,
          lastRunAtMs: 0,
          lastTask: null,
          lastRunId: null,
          lastFailedStep: null,
          lastError: null,
        })
      }
      const wf = byWorkflow.get(row.workflow_id)!
      if (st === 'running') wf.runningSteps += 1
      if (st === 'pending' || st === 'waiting') wf.queuedSteps += 1
    }

    // Attach failed-step context for latest failed run per workflow
    for (const [workflowId, agg] of Array.from(byWorkflow.entries())) {
      const lastStatus = String(agg.lastRunStatus || '').toLowerCase()
      if (!agg.lastRunId || !(lastStatus === 'failed' || lastStatus === 'error' || lastStatus === 'cancelled')) continue

      const failed = db.prepare(`
        SELECT step_id, output
        FROM steps
        WHERE run_id = ? AND status = 'failed'
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(agg.lastRunId) as { step_id?: string; output?: string } | undefined

      if (failed?.step_id) agg.lastFailedStep = String(failed.step_id)
      if (failed?.output) agg.lastError = String(failed.output).trim().slice(0, 220)
    }

    db.close()
  } catch {
    return { byAgent: new Map(), byWorkflow: new Map() }
  }

  return { byAgent, byWorkflow }
}

function workflowStatusFromAgg(agg: {
  activeRuns: number
  failedRuns: number
  completedRuns: number
  lastRunStatus: string | null
}): WorkflowHealth['status'] {
  if (agg.activeRuns > 0) return 'running'
  const last = (agg.lastRunStatus || '').toLowerCase()
  if (last === 'failed' || last === 'error' || last === 'cancelled') return 'failed'
  if (last === 'completed' || last === 'done') return 'completed'
  return 'idle'
}

export async function GET() {
  try {
    const home = homedir()
    const agentsDir = join(home, '.openclaw', 'agents')

    const entries = await readdir(agentsDir, { withFileTypes: true })
    const agentDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    let configAgents: Array<{ id: string; model?: string }> = []
    let defaultModel = 'anthropic/claude-opus-4-6'
    const aliasToModel = new Map<string, string>()
    try {
      const raw = await readFile(join(home, '.openclaw', 'openclaw.json'), 'utf-8')
      const cfg = JSON.parse(raw)
      configAgents = cfg?.agents?.list ?? []
      defaultModel = cfg?.agents?.defaults?.model?.primary || cfg?.defaults?.model || defaultModel
      const modelDefs = cfg?.agents?.defaults?.models ?? {}
      for (const [model, def] of Object.entries(modelDefs)) {
        const alias = (def as { alias?: string })?.alias
        if (alias) aliasToModel.set(String(alias), String(model))
      }
    } catch {}

    const modelMap = new Map<string, string>()
    for (const a of configAgents) {
      if (a.id && a.model) {
        const model = aliasToModel.get(String(a.model)) || String(a.model)
        modelMap.set(a.id, model)
        modelMap.set(normalizeAgentId(a.id), model)
      }
    }

    const scheduledJobsByAgent = new Map<string, number>()
    try {
      const cronRaw = await readFile(join(home, '.openclaw', 'cron', 'jobs.json'), 'utf-8')
      const cronData = JSON.parse(cronRaw)
      const jobs = cronData?.jobs ?? (Array.isArray(cronData) ? cronData : [])
      for (const job of jobs) {
        if (job?.enabled === false) continue
        if (job?.payload?.kind !== 'agentTurn') continue
        const aid = String(job?.agentId || '').trim()
        if (!aid) continue
        const normalized = normalizeAgentId(aid)
        scheduledJobsByAgent.set(normalized, (scheduledJobsByAgent.get(normalized) || 0) + 1)
      }
    } catch {}

    const runtime = loadRuntimeStats()

    const now = Date.now()

    const agents: AgentInfo[] = await Promise.all(
      agentDirs.map(async (dirName) => {
        let hasSessions = false
        let lastActiveMs = 0

        try {
          const sessDir = join(agentsDir, dirName, 'sessions')
          await access(sessDir)
          const files = await readdir(sessDir)
          const jsonl = files.filter((f) => f.endsWith('.jsonl') && !f.endsWith('.lock'))
          hasSessions = jsonl.length > 0

          if (jsonl.length > 0) {
            const stats = await Promise.all(
              jsonl.map(async (f) => {
                try {
                  const s = await stat(join(sessDir, f))
                  return s.mtimeMs
                } catch {
                  return 0
                }
              })
            )
            lastActiveMs = Math.max(...stats, 0)
          }
        } catch {}

        const model = modelMap.get(dirName) ?? defaultModel
        const group = getGroup(dirName)
        const runtimeForAgent = runtime.byAgent.get(dirName) || { runningSteps: 0, queuedSteps: 0 }
        const scheduledJobs = scheduledJobsByAgent.get(dirName) || 0
        const recentSession = lastActiveMs > 0 && (now - lastActiveMs) <= ACTIVE_WINDOW_MS
        const staleSession = lastActiveMs > 0 && (now - lastActiveMs) >= STALE_WINDOW_MS
        let activity: AgentInfo['activity'] = 'idle'
        if (runtimeForAgent.runningSteps > 0) activity = 'active'
        else if (runtimeForAgent.queuedSteps > 0) activity = 'queued'
        else if (recentSession) activity = 'active'
        else if (staleSession) activity = 'stale'

        return {
          id: dirName,
          name: formatName(dirName),
          model,
          hasSessions,
          group,
          activity,
          lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
          runningSteps: runtimeForAgent.runningSteps,
          queuedSteps: runtimeForAgent.queuedSteps,
          scheduledJobs,
        }
      })
    )

    agents.sort((a, b) => {
      if (a.group === 'core' && b.group !== 'core') return -1
      if (a.group !== 'core' && b.group === 'core') return 1
      if (a.group !== b.group) return a.group.localeCompare(b.group)
      return a.name.localeCompare(b.name)
    })

    const queuedAgents = agents.filter((a) => a.activity === 'queued').length
    const scheduledAgents = agents.filter((a) => a.scheduledJobs > 0).length

    const workflowIds = new Set<string>(Array.from(runtime.byWorkflow.keys()))
    try {
      const workflowDir = join(home, '.openclaw', 'workspace', 'tmp', 'antfarm', 'workflows')
      const wfEntries = await readdir(workflowDir, { withFileTypes: true })
      for (const e of wfEntries) if (e.isDirectory()) workflowIds.add(e.name)
    } catch {}

    const workflowHealth: WorkflowHealth[] = Array.from(workflowIds).map((id) => {
      const agg = runtime.byWorkflow.get(id) || {
        activeRuns: 0,
        runningSteps: 0,
        queuedSteps: 0,
        failedRuns: 0,
        completedRuns: 0,
        lastRunStatus: null,
        lastRunAtMs: 0,
        lastTask: null,
        lastRunId: null,
        lastFailedStep: null,
        lastError: null,
      }

      return {
        id,
        status: workflowStatusFromAgg(agg),
        activeRuns: agg.activeRuns,
        runningSteps: agg.runningSteps,
        queuedSteps: agg.queuedSteps,
        failedRuns: agg.failedRuns,
        completedRuns: agg.completedRuns,
        lastRunStatus: agg.lastRunStatus,
        lastRunAt: agg.lastRunAtMs ? new Date(agg.lastRunAtMs).toISOString() : null,
        lastTask: agg.lastTask,
        lastFailedStep: agg.lastFailedStep,
        lastError: agg.lastError,
      }
    })

    const summary = {
      total: agents.length,
      active: agents.filter((a) => a.activity === 'active').length,
      queued: queuedAgents,
      scheduled: scheduledAgents,
      idle: agents.filter((a) => a.activity === 'idle').length,
      stale: agents.filter((a) => a.activity === 'stale').length,
      activeRuns: workflowHealth.reduce((sum, wf) => sum + wf.activeRuns, 0),
      runningSteps: workflowHealth.reduce((sum, wf) => sum + wf.runningSteps, 0),
      queuedSteps: workflowHealth.reduce((sum, wf) => sum + wf.queuedSteps, 0),
      failedWorkflows: workflowHealth.filter((wf) => wf.status === 'failed').length,
    }

    workflowHealth.sort((a, b) => {
      const rank = { failed: 0, running: 1, idle: 2, completed: 3 }
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
      return a.id.localeCompare(b.id)
    })

    return Response.json({ agents, summary, workflowHealth })
  } catch {
    return Response.json({ agents: [], summary: { total: 0, active: 0, queued: 0, scheduled: 0, idle: 0, stale: 0, activeRuns: 0, runningSteps: 0, queuedSteps: 0, failedWorkflows: 0 }, workflowHealth: [] })
  }
}
