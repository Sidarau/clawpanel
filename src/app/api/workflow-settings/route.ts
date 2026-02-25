import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
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

type AgentCfg = {
  id: string
  name: string
  role: string
  model: string
  description: string
}

type StepCfg = {
  id: string
  agent: string
  input: string
}

type WorkflowCfg = {
  id: string
  name: string
  version: number
  description: string
  agents: AgentCfg[]
  steps: StepCfg[]
}

function stripYamlQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseScalar(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? stripYamlQuotes(m[1].trim()) : ''
}

function parseBlock(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}:\\s*\\|\\n([\\s\\S]*?)(?=\\n\\S[^\\n]*:\\s*|$)`))
  if (!m) return parseScalar(raw, key)
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

function parseAgents(raw: string): AgentCfg[] {
  const section = sectionBetween(raw, 'agents', 'steps')
  if (!section.trim()) return []

  const lines = section.split('\n')
  const out: AgentCfg[] = []

  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/^\s*-\s+id:\s*(.+)\s*$/)
    if (!start) continue

    const id = stripYamlQuotes(start[1])
    const agent: AgentCfg = {
      id,
      name: id,
      role: 'analysis',
      model: 'default',
      description: '',
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

function parseSteps(raw: string): StepCfg[] {
  const section = sectionBetween(raw, 'steps')
  if (!section.trim()) return []

  const lines = section.split('\n')
  const out: StepCfg[] = []

  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/^\s*-\s+id:\s*(.+)\s*$/)
    if (!start) continue

    const step: StepCfg = {
      id: stripYamlQuotes(start[1]),
      agent: '',
      input: '',
    }

    i += 1
    while (i < lines.length && !/^\s*-\s+id:\s*/.test(lines[i])) {
      const line = lines[i]

      const agentMatch = line.match(/^\s+agent:\s*(.+)\s*$/)
      if (agentMatch) {
        step.agent = stripYamlQuotes(agentMatch[1])
        i += 1
        continue
      }

      const inputStart = line.match(/^\s+input:\s*\|\s*$/)
      if (inputStart) {
        const block: string[] = []
        i += 1
        while (i < lines.length) {
          const next = lines[i]
          if (/^\s*-\s+id:\s*/.test(next)) {
            i -= 1
            break
          }
          if (/^\s{4}[A-Za-z_][A-Za-z0-9_]*:\s*/.test(next)) {
            i -= 1
            break
          }
          block.push(next.replace(/^\s{6}/, ''))
          i += 1
        }
        step.input = block.join('\n').trimEnd()
      }

      i += 1
    }

    out.push(step)
    i -= 1
  }

  return out
}

function toYaml(wf: WorkflowCfg): string {
  const esc = (s: string) => s.replace(/\r/g, '')

  const agentsYaml = wf.agents.map(a => `  - id: ${a.id}
    name: ${a.name}
    role: ${a.role || 'analysis'}
    model: ${a.model || 'minimax-portal/MiniMax-M2.5'}
    description: ${a.description || 'TBD'}`).join('\n\n')

  const stepsYaml = wf.steps.map(st => {
    const input = esc(st.input || '').split('\n').map(l => `      ${l}`).join('\n')
    return `  - id: ${st.id}
    agent: ${st.agent}
    input: |
${input || '      '}
    expects: "STATUS: done"
    max_retries: 2`
  }).join('\n\n')

  return `id: ${wf.id}
name: ${wf.name}
version: ${wf.version || 1}
description: |
  ${esc(wf.description || '').split('\n').join('\n  ')}

agents:
${agentsYaml || '  []'}

steps:
${stepsYaml || '  []'}
`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = (url.searchParams.get('id') || '').trim()
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    const file = join(resolveWorkflowsDir(), id, 'workflow.yml')
    const raw = await readFile(file, 'utf-8')

    const workflow: WorkflowCfg = {
      id: parseScalar(raw, 'id') || id,
      name: parseScalar(raw, 'name') || id,
      version: Number(parseScalar(raw, 'version') || 1),
      description: parseBlock(raw, 'description'),
      agents: parseAgents(raw),
      steps: parseSteps(raw),
    }

    return Response.json({ workflow })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const wf = body.workflow as WorkflowCfg
    if (!wf?.id || !wf?.name) {
      return Response.json({ error: 'Invalid workflow payload' }, { status: 400 })
    }

    const dir = join(resolveWorkflowsDir(), wf.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'workflow.yml'), toYaml(wf), 'utf-8')

    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
