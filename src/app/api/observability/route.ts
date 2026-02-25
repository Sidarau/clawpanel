import { NextResponse } from 'next/server'
import { access, readdir, readFile, stat } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFile, spawn } from 'child_process'

const CLAWMETRY_PORT = 8900
const CLAWMETRY_HOST = '127.0.0.1'

type SessionFile = {
  agentId: string
  file: string
  path: string
  mtimeMs: number
}

function parseMessageText(msg: any): string {
  if (!msg) return ''
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => String(c?.text || ''))
      .join('\n')
  }
  return ''
}

function execFileAsync(cmd: string, args: string[] = []): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 6000 }, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveGatewayConfig(): Promise<{ token: string; port: number }> {
  try {
    const cfgPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = await readFile(cfgPath, 'utf-8')
    const cfg = JSON.parse(raw)
    const token = String(cfg?.gateway?.auth?.token || '')
    const port = Number(cfg?.gateway?.port || 18889)
    return { token, port }
  } catch {
    return { token: '', port: 18889 }
  }
}

async function isClawmetryRunning(): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-f', `clawmetry --host ${CLAWMETRY_HOST} --port ${CLAWMETRY_PORT}`])
    return true
  } catch {
    return false
  }
}

async function clawmetryReachable(): Promise<boolean> {
  try {
    const res = await fetch(`http://${CLAWMETRY_HOST}:${CLAWMETRY_PORT}/api/auth/check`, {
      signal: AbortSignal.timeout(1200),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

async function clawmetryInstalledPath(): Promise<string | null> {
  const candidates = [
    join('/home/ubuntu/.openclaw/workspace', 'clawmetry-env', 'bin', 'clawmetry'),
    join(homedir(), '.local', 'bin', 'clawmetry'),
    '/usr/local/bin/clawmetry',
    '/usr/bin/clawmetry',
  ]

  for (const p of candidates) {
    if (await exists(p)) return p
  }
  return null
}

async function startClawmetry(): Promise<{ ok: boolean; message: string }> {
  const installed = await clawmetryInstalledPath()
  if (!installed) return { ok: false, message: 'clawmetry binary not found' }

  if (await isClawmetryRunning()) {
    return { ok: true, message: 'already running' }
  }

  const { token, port } = await resolveGatewayConfig()
  const env = {
    ...process.env,
    OPENCLAW_GATEWAY_TOKEN: token,
    OPENCLAW_GATEWAY_PORT: String(port),
    OPENCLAW_DATA_DIR: join(homedir(), '.openclaw'),
    OPENCLAW_WORKSPACE: '/home/ubuntu/.openclaw/workspace',
  }

  const child = spawn(installed, [
    '--host', CLAWMETRY_HOST,
    '--port', String(CLAWMETRY_PORT),
    '--data-dir', join(homedir(), '.openclaw'),
    '--workspace', '/home/ubuntu/.openclaw/workspace',
    '--no-debug',
  ], {
    detached: true,
    stdio: 'ignore',
    env,
  })

  child.unref()

  // Give process a moment to boot
  await new Promise(r => setTimeout(r, 1200))
  const running = await isClawmetryRunning()
  return {
    ok: running,
    message: running ? 'started' : 'failed to start',
  }
}

async function stopClawmetry(): Promise<{ ok: boolean; message: string }> {
  try {
    await execFileAsync('pkill', ['-f', `clawmetry --host ${CLAWMETRY_HOST} --port ${CLAWMETRY_PORT}`])
  } catch {
    // pkill exits non-zero if process wasn't running
  }

  await new Promise(r => setTimeout(r, 400))
  const running = await isClawmetryRunning()
  return {
    ok: !running,
    message: running ? 'failed to stop' : 'stopped',
  }
}

async function collectSessionMetrics() {
  const agentsRoot = join(homedir(), '.openclaw', 'agents')
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000

  const files: SessionFile[] = []
  try {
    const agentIds = await readdir(agentsRoot)
    for (const agentId of agentIds) {
      const sessionsDir = join(agentsRoot, agentId, 'sessions')
      let dirFiles: string[] = []
      try {
        dirFiles = await readdir(sessionsDir)
      } catch {
        continue
      }

      for (const file of dirFiles) {
        if (!file.endsWith('.jsonl')) continue
        if (file.endsWith('.lock')) continue
        if (file.includes('.deleted.')) continue

        const full = join(sessionsDir, file)
        try {
          const s = await stat(full)
          files.push({ agentId, file, path: full, mtimeMs: s.mtimeMs })
        } catch {
          // ignore unreadable files
        }
      }
    }
  } catch {
    return {
      summary: {
        totalSessions: 0,
        activeAgents: 0,
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        sessions24h: 0,
        messages24h: 0,
        userMessages24h: 0,
        assistantMessages24h: 0,
      },
      byAgent: [],
      recentSessions: [],
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const scanned = files.slice(0, 220)

  let totalMessages = 0
  let userMessages = 0
  let assistantMessages = 0
  let sessions24h = 0
  let messages24h = 0
  let userMessages24h = 0
  let assistantMessages24h = 0

  const byAgent = new Map<string, {
    sessions: number
    sessions24h: number
    messages: number
    messages24h: number
    userMessages: number
    assistantMessages: number
    lastActiveAt: string | null
  }>()

  const recentSessions: Array<{
    sessionId: string
    agentId: string
    updatedAt: string
    messageCount: number
    userMessages: number
    assistantMessages: number
    lastMessageRole: string | null
    preview: string
  }> = []

  for (const f of scanned) {
    let raw = ''
    try {
      raw = await readFile(f.path, 'utf-8')
    } catch {
      continue
    }

    const lines = raw.split('\n').filter(Boolean)
    const mtimeIso = new Date(f.mtimeMs).toISOString()

    let fileMessages = 0
    let fileUser = 0
    let fileAssistant = 0
    let fileMessages24h = 0
    let fileUser24h = 0
    let fileAssistant24h = 0
    let lastRole: string | null = null
    let lastPreview = ''

    for (const line of lines) {
      let obj: any
      try {
        obj = JSON.parse(line)
      } catch {
        continue
      }
      if (obj?.type !== 'message') continue

      const role = String(obj?.message?.role || '')
      if (!role) continue

      const text = parseMessageText(obj.message).trim()
      const ts = Date.parse(String(obj?.timestamp || ''))
      const in24h = Number.isFinite(ts) ? ts >= cutoffMs : false

      fileMessages += 1
      if (role === 'user') fileUser += 1
      if (role === 'assistant') fileAssistant += 1

      if (in24h) {
        fileMessages24h += 1
        if (role === 'user') fileUser24h += 1
        if (role === 'assistant') fileAssistant24h += 1
      }

      lastRole = role
      if (text) lastPreview = text.slice(0, 140)
    }

    totalMessages += fileMessages
    userMessages += fileUser
    assistantMessages += fileAssistant
    messages24h += fileMessages24h
    userMessages24h += fileUser24h
    assistantMessages24h += fileAssistant24h

    const is24hSession = f.mtimeMs >= cutoffMs || fileMessages24h > 0
    if (is24hSession) sessions24h += 1

    const curr = byAgent.get(f.agentId) || {
      sessions: 0,
      sessions24h: 0,
      messages: 0,
      messages24h: 0,
      userMessages: 0,
      assistantMessages: 0,
      lastActiveAt: null,
    }

    curr.sessions += 1
    if (is24hSession) curr.sessions24h += 1
    curr.messages += fileMessages
    curr.messages24h += fileMessages24h
    curr.userMessages += fileUser
    curr.assistantMessages += fileAssistant
    if (!curr.lastActiveAt || Date.parse(curr.lastActiveAt) < f.mtimeMs) {
      curr.lastActiveAt = mtimeIso
    }
    byAgent.set(f.agentId, curr)

    recentSessions.push({
      sessionId: f.file.replace(/\.jsonl$/, ''),
      agentId: f.agentId,
      updatedAt: mtimeIso,
      messageCount: fileMessages,
      userMessages: fileUser,
      assistantMessages: fileAssistant,
      lastMessageRole: lastRole,
      preview: lastPreview,
    })
  }

  const byAgentList = Array.from(byAgent.entries())
    .map(([agentId, v]) => ({ agentId, ...v }))
    .sort((a, b) => {
      if (b.messages24h !== a.messages24h) return b.messages24h - a.messages24h
      return b.messages - a.messages
    })
    .slice(0, 12)

  const recent = recentSessions
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 12)

  return {
    summary: {
      totalSessions: scanned.length,
      activeAgents: byAgentList.length,
      totalMessages,
      userMessages,
      assistantMessages,
      sessions24h,
      messages24h,
      userMessages24h,
      assistantMessages24h,
    },
    byAgent: byAgentList,
    recentSessions: recent,
  }
}

export async function GET() {
  try {
    const [installedPath, running, reachable, metrics] = await Promise.all([
      clawmetryInstalledPath(),
      isClawmetryRunning(),
      clawmetryReachable(),
      collectSessionMetrics(),
    ])

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      clawmetry: {
        installed: Boolean(installedPath),
        binaryPath: installedPath,
        running,
        reachable,
        url: `http://${CLAWMETRY_HOST}:${CLAWMETRY_PORT}`,
      },
      ...metrics,
    })
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch observability data: ${String(error)}` }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { action?: string }
    const action = String(body?.action || '').toLowerCase()

    if (action === 'start') {
      const res = await startClawmetry()
      return NextResponse.json(res, { status: res.ok ? 200 : 500 })
    }

    if (action === 'stop') {
      const res = await stopClawmetry()
      return NextResponse.json(res, { status: res.ok ? 200 : 500 })
    }

    return NextResponse.json({ error: 'Unsupported action. Use { action: "start" | "stop" }' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: `Failed to run action: ${String(error)}` }, { status: 500 })
  }
}
