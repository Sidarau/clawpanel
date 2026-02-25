import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'os'
import { join } from 'path'

const WORKFLOW_DIR_CANDIDATES = [
  join(homedir(), '.openclaw', 'antfarm', 'workflows'),
  '/home/ubuntu/.openclaw/workspace/antfarm/workflows',
  '/home/ubuntu/.openclaw/workspace/tmp/antfarm/workflows',
]

function resolveWorkflowsDir(): string {
  for (const dir of WORKFLOW_DIR_CANDIDATES) {
    if (existsSync(dir)) return dir
  }
  return WORKFLOW_DIR_CANDIDATES[0]
}

const ANTFARM_DB = join(homedir(), '.openclaw', 'antfarm', 'antfarm.db')

interface WorkflowAgent {
  id: string
  name: string
  role: string
  description: string
  model: string
}

interface WorkflowRuntime {
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

interface Workflow {
  id: string
  name: string
  description: string
  version: number
  agents: WorkflowAgent[]
  runtime: WorkflowRuntime
}

type RuntimeAgg = {
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
}

const DEFAULT_RUNTIME: WorkflowRuntime = {
  status: 'idle',
  activeRuns: 0,
  runningSteps: 0,
  queuedSteps: 0,
  failedRuns: 0,
  completedRuns: 0,
  lastRunStatus: null,
  lastRunAt: null,
  lastTask: null,
  lastFailedStep: null,
  lastError: null,
}

export async function GET() {
  try {
    const runtimeByWorkflow = loadRuntimeByWorkflow()
    const workflowsDir = resolveWorkflowsDir()
    const entries = await readdir(workflowsDir, { withFileTypes: true })
    const workflows: Workflow[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      try {
        const raw = await readFile(join(workflowsDir, entry.name, 'workflow.yml'), 'utf-8')
        const id = extractScalar(raw, 'id') || entry.name
        const name = extractScalar(raw, 'name') || entry.name
        const description = extractBlock(raw, 'description') || ''
        const version = Number(extractScalar(raw, 'version') || 1)

        workflows.push({
          id,
          name,
          description: description.trim(),
          version,
          agents: parseAgents(raw),
          runtime: runtimeByWorkflow.get(id) || { ...DEFAULT_RUNTIME },
        })
      } catch {}
    }

    workflows.sort((a, b) => a.name.localeCompare(b.name))
    return Response.json({ workflows })
  } catch {
    return Response.json({ workflows: [] })
  }
}

function extractScalar(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!m) return null
  return stripYamlQuotes(m[1].trim())
}

function extractBlock(raw: string, key: string): string | null {
  const m = raw.match(new RegExp(`^${key}:\\s*\\|\\n([\\s\\S]*?)(?=\\n\\S[^\\n]*:\\s*|$)`))
  if (!m) return extractScalar(raw, key)
  return m[1].replace(/^ {2}/gm, '').trim()
}

function sectionBetween(raw: string, startKey: string, endKey?: string): string {
  const startToken = `${startKey}:\n`
  const startIdx = raw.indexOf(startToken)
  if (startIdx < 0) return ''

  const from = startIdx + startToken.length
  if (!endKey) return raw.slice(from)

  const endToken = `\n${endKey}:\n`
  const endIdx = raw.indexOf(endToken, from)
  return endIdx >= 0 ? raw.slice(from, endIdx) : raw.slice(from)
}

function stripYamlQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseAgents(raw: string): WorkflowAgent[] {
  const section = sectionBetween(raw, 'agents', 'steps')
  if (!section.trim()) return []

  const lines = section.split('\n')
  const out: WorkflowAgent[] = []

  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/^\s*-\s+id:\s*(.+)\s*$/)
    if (!start) continue

    const id = stripYamlQuotes(start[1])
    const agent: WorkflowAgent = {
      id,
      name: id,
      role: 'unknown',
      description: '',
      model: 'default',
    }

    i += 1
    while (i < lines.length && !/^\s*-\s+id:\s*/.test(lines[i])) {
      const m = lines[i].match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
      if (m) {
        const key = m[1]
        const value = stripYamlQuotes(m[2] || '')
        if (key === 'name' && value) agent.name = value
        if (key === 'role' && value) agent.role = value
        if (key === 'model' && value) agent.model = value
        if (key === 'description' && value) agent.description = value
      }
      i += 1
    }

    out.push(agent)
    i -= 1
  }

  return out
}

function emptyAgg(): RuntimeAgg {
  return {
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
}

function toMs(input: string | null | undefined): number {
  const raw = String(input || '').trim()
  if (!raw) return 0
  const isoish = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`
  const ms = Date.parse(isoish)
  return Number.isFinite(ms) ? ms : 0
}

function loadRuntimeByWorkflow(): Map<string, WorkflowRuntime> {
  const byWorkflow = new Map<string, RuntimeAgg>()
  if (!existsSync(ANTFARM_DB)) return new Map()

  try {
    const db = new DatabaseSync(ANTFARM_DB, { readOnly: true })

    const runs = db.prepare(`
      SELECT id, workflow_id, status, updated_at, task
      FROM runs
      ORDER BY updated_at DESC
    `).all() as Array<{
      id: string
      workflow_id: string
      status: string
      updated_at: string
      task: string
    }>

    for (const run of runs) {
      const key = run.workflow_id
      if (!byWorkflow.has(key)) byWorkflow.set(key, emptyAgg())
      const agg = byWorkflow.get(key)!

      const status = String(run.status || '').toLowerCase()
      if (status === 'running') agg.activeRuns += 1
      if (status === 'failed' || status === 'error') agg.failedRuns += 1
      if (status === 'completed' || status === 'done') agg.completedRuns += 1

      // runs are ordered desc, first seen is latest
      if (!agg.lastRunId) {
        agg.lastRunId = run.id
        agg.lastRunStatus = run.status || null
        agg.lastRunAtMs = toMs(run.updated_at)
        agg.lastTask = (run.task || '').trim() || null
      }
    }

    const stepRows = db.prepare(`
      SELECT r.workflow_id AS workflow_id, s.status AS status
      FROM steps s
      JOIN runs r ON r.id = s.run_id
      WHERE r.status = 'running'
    `).all() as Array<{ workflow_id: string; status: string }>

    for (const row of stepRows) {
      const key = row.workflow_id
      if (!byWorkflow.has(key)) byWorkflow.set(key, emptyAgg())
      const agg = byWorkflow.get(key)!

      const st = String(row.status || '').toLowerCase()
      if (st === 'running') agg.runningSteps += 1
      if (st === 'pending' || st === 'waiting') agg.queuedSteps += 1
    }

    // Attach failed-step context for latest failed run
    for (const agg of Array.from(byWorkflow.values())) {
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
    return new Map()
  }

  const out = new Map<string, WorkflowRuntime>()

  for (const [workflowId, agg] of Array.from(byWorkflow.entries())) {
    const last = String(agg.lastRunStatus || '').toLowerCase()
    let status: WorkflowRuntime['status'] = 'idle'
    if (agg.activeRuns > 0) status = 'running'
    else if (last === 'failed' || last === 'error' || last === 'cancelled') status = 'failed'
    else if (last === 'completed' || last === 'done') status = 'completed'

    out.set(workflowId, {
      status,
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
    })
  }

  return out
}
