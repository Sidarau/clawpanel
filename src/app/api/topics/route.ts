import { appendFile, readdir, readFile, stat } from 'fs/promises'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_TOPIC_MAP, getAllChannelLinks, getChannelLink, upsertChannelLink } from '@/lib/channel-links'

interface TopicMessage {
  id: string
  role: string
  text: string
  timestamp: string
  sender?: string
  source?: 'telegram' | 'web' | 'system'
}

function parseMessageText(msg: any): string {
  if (!msg) return ''
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((c: Record<string, unknown>) => c.type === 'text')
      .map((c: Record<string, unknown>) => String(c.text || ''))
      .join('\n')
  }
  return ''
}

function extractSessionIdFromFile(file: string): string | null {
  const m = file.match(/^([a-f0-9-]{36})(?:-topic-\d+)?\.jsonl$/i)
  return m?.[1] || null
}

async function findLatestTopicFile(sessDir: string, topicId: string): Promise<string | null> {
  const files = await readdir(sessDir)
  const candidates = files.filter((f) => f.includes(`-topic-${topicId}.jsonl`) && !f.endsWith('.lock'))
  if (!candidates.length) return null

  const withTs = await Promise.all(candidates.map(async (f) => {
    try {
      const s = await stat(join(sessDir, f))
      return { f, ts: s.mtimeMs }
    } catch {
      return { f, ts: 0 }
    }
  }))

  withTs.sort((a, b) => b.ts - a.ts)
  return withTs[0]?.f || null
}

async function findLatestSessionFileById(sessDir: string, sessionId: string): Promise<string | null> {
  const files = await readdir(sessDir)
  const candidates = files.filter((f) =>
    (f === `${sessionId}.jsonl` || f.startsWith(`${sessionId}-topic-`))
    && !f.endsWith('.lock')
    && !f.includes('.deleted.')
  )

  if (!candidates.length) return null

  const withTs = await Promise.all(candidates.map(async (f) => {
    try {
      const s = await stat(join(sessDir, f))
      return { f, ts: s.mtimeMs }
    } catch {
      return { f, ts: 0 }
    }
  }))

  withTs.sort((a, b) => b.ts - a.ts)
  return withTs[0]?.f || null
}

function detectSource(text: string, role: string): 'telegram' | 'web' | 'system' {
  if (role === 'system') return 'system'
  if (text.includes('[source: ClawPanel web chat]')) return 'web'
  if (text.includes('[Telegram')) return 'telegram'
  return 'system'
}

async function resolveChannelRuntime(channel: string, sessDir: string): Promise<{
  topicId?: string
  sessionId?: string
  sessionFile?: string
}> {
  const link = await getChannelLink(channel)
  const topicId = link?.telegram?.topicId

  if (topicId) {
    const topicFile = await findLatestTopicFile(sessDir, topicId)
    if (topicFile) {
      const sessionId = extractSessionIdFromFile(topicFile) || link?.sessionId
      return { topicId, sessionId: sessionId || undefined, sessionFile: topicFile }
    }
  }

  if (link?.sessionId) {
    const sessionFile = await findLatestSessionFileById(sessDir, link.sessionId)
    return {
      topicId,
      sessionId: link.sessionId,
      sessionFile: sessionFile || undefined,
    }
  }

  return { topicId }
}

async function resolveSessionKeyById(sessionId: string, topicId?: string): Promise<string | null> {
  try {
    const idxPath = join(homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json')
    const raw = await readFile(idxPath, 'utf-8')
    const index = JSON.parse(raw) as Record<string, { sessionId?: string }>

    const keys = Object.entries(index)
      .filter(([, v]) => v?.sessionId === sessionId)
      .map(([k]) => k)

    if (topicId) {
      const topicKey = keys.find((k) => k.includes(`:topic:${topicId}`))
      if (topicKey) return topicKey
    }

    return keys[0] || null
  } catch {
    return null
  }
}

function triggerAgentTurn(sessionKey: string, payload: string) {
  // Use gateway RPC via CLI — fire-and-forget
  setTimeout(() => {
    try {
      const params = JSON.stringify({
        sessionKey,
        message: payload,
        idempotencyKey: randomUUID(),
      })

      const child = spawn('node', [
        '/usr/lib/node_modules/openclaw/openclaw.mjs',
        'gateway', 'call', 'chat.send',
        '--params', params,
        '--json',
        '--timeout', '120000',
      ], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      })
      child.unref()
    } catch {
      // best-effort
    }
  }, 50)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const channel = url.searchParams.get('channel')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 50

  const home = homedir()
  const sessDir = join(home, '.openclaw', 'agents', 'main', 'sessions')

  // If channel provided, return messages for resolved session
  if (channel) {
    try {
      const runtime = await resolveChannelRuntime(channel, sessDir)
      const link = await getChannelLink(channel)

      if (!runtime.sessionFile) {
        return Response.json({
          messages: [],
          total: 0,
          topicId: runtime.topicId || null,
          sessionId: runtime.sessionId || null,
          link,
        })
      }

      const filePath = join(sessDir, runtime.sessionFile)
      const raw = await readFile(filePath, 'utf-8')
      const lines = raw.trim().split('\n').filter(Boolean)

      const messages: TopicMessage[] = []
      for (const line of lines) {
        try {
          const obj = JSON.parse(line)
          if (obj.type !== 'message') continue
          const msg = obj.message
          if (!msg) continue

          let text = parseMessageText(msg)
          if (!text.trim()) continue

          let sender: string | undefined
          if (msg.role === 'user') {
            const match = text.match(/\]\s*(.+?)\s*\(\d+\):\s*/)
            if (match) {
              sender = match[1]
              const msgStart = text.indexOf(']: ')
              if (msgStart > -1) {
                text = text.slice(msgStart + 3)
                const colonIdx = text.indexOf(': ')
                if (colonIdx > -1 && colonIdx < 40) text = text.slice(colonIdx + 2)
              }
            }
          }

          messages.push({
            id: obj.id || String(messages.length),
            role: msg.role || 'unknown',
            text,
            timestamp: obj.timestamp || '',
            sender,
            source: detectSource(text, msg.role || 'unknown'),
          })
        } catch {}
      }

      // Merge board comments/project notes
      const commentsFile = join(home, '.openclaw', 'workspace', 'todo', 'comments', `${channel}.jsonl`)
      try {
        const commentsRaw = await readFile(commentsFile, 'utf-8')
        const commentLines = commentsRaw.trim().split('\n').filter(Boolean)

        for (const line of commentLines) {
          try {
            const entry = JSON.parse(line)
            if (entry.type === 'panel-user-message') continue
            const isNote = entry.action === 'note'
            messages.push({
              id: `comment-${entry.ts}`,
              role: 'system',
              text: isNote
                ? `📋 [${entry.ticketId}] ${entry.sender || 'Alex'}: ${entry.text}`
                : `📋 [${entry.ticketId}] ${entry.text}`,
              timestamp: entry.ts || '',
              sender: entry.sender,
              source: 'system',
            })
          } catch {}
        }

        messages.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
      } catch {}

      const result = messages.slice(-limit)
      return Response.json({
        messages: result,
        total: messages.length,
        topicId: runtime.topicId || null,
        sessionId: runtime.sessionId || extractSessionIdFromFile(runtime.sessionFile) || null,
        link,
      })
    } catch {
      return Response.json({ messages: [], total: 0 })
    }
  }

  // No channel — return topic/project list with metadata
  try {
    const links = await getAllChannelLinks({ includeDefaults: true })
    const channels = Array.from(new Set<string>([
      ...Object.values(DEFAULT_TOPIC_MAP),
      ...Object.keys(links),
    ])).sort()

    const topics = []

    for (const channelName of channels) {
      const runtime = await resolveChannelRuntime(channelName, sessDir)
      let messageCount = 0
      let lastMessage = ''
      let lastTs = ''

      if (runtime.sessionFile) {
        try {
          const filePath = join(sessDir, runtime.sessionFile)
          const raw = await readFile(filePath, 'utf-8')
          const lines = raw.trim().split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              const obj = JSON.parse(line)
              if (obj.type !== 'message') continue
              messageCount += 1

              const msg = obj.message
              if (msg?.role === 'assistant') {
                const text = parseMessageText(msg)
                if (text) {
                  lastMessage = text.slice(0, 80)
                  lastTs = obj.timestamp || ''
                }
              }
            } catch {}
          }
        } catch {}
      }

      topics.push({
        topicId: runtime.topicId || null,
        channel: channelName,
        messageCount,
        lastMessage,
        lastTs,
        hasSession: !!runtime.sessionFile,
        sessionId: runtime.sessionId || null,
      })
    }

    return Response.json({ topics })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

// Send a user message into a channel-linked session
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const channel = String(body?.channel || '').trim()
    const text = String(body?.text || '').trim()
    const attachments = Array.isArray(body?.attachments) ? body.attachments : []

    if (!channel) return Response.json({ error: 'Missing channel' }, { status: 400 })
    if (!text && attachments.length === 0) return Response.json({ error: 'Empty message' }, { status: 400 })

    const home = homedir()
    const sessDir = join(home, '.openclaw', 'agents', 'main', 'sessions')

    let runtime = await resolveChannelRuntime(channel, sessDir)
    let link = await getChannelLink(channel)

    // Ensure persistent session for this channel
    if (!runtime.sessionId) {
      const newSessionId = randomUUID()
      link = await upsertChannelLink({
        channel,
        sessionId: newSessionId,
      })
      runtime = { ...runtime, sessionId: newSessionId }
    }

    const attachmentLines = attachments
      .map((a: any) => `- ${String(a?.name || 'file')} (${String(a?.url || '')})`)
      .filter(Boolean)

    const payloadLines = [
      text,
      attachmentLines.length ? `\nAttachments:\n${attachmentLines.join('\n')}` : '',
      '\n[source: ClawPanel web chat]',
    ]
    const payload = payloadLines.join('').trim()

    // Persist user message into the canonical session JSONL so refresh stays in sync.
    const topicId = link?.telegram?.topicId || runtime.topicId
    const sessionFileName = runtime.sessionFile
      || (topicId ? `${runtime.sessionId!}-topic-${topicId}.jsonl` : `${runtime.sessionId!}.jsonl`)
    const sessionFilePath = join(sessDir, sessionFileName)
    const now = new Date().toISOString()
    const messageId = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const envelope = {
      type: 'message',
      id: messageId,
      parentId: null,
      timestamp: now,
      message: {
        role: 'user',
        content: [{ type: 'text', text: payload }],
      },
    }

    await appendFile(sessionFilePath, JSON.stringify(envelope) + '\n', 'utf-8')

    // Resolve the full session key and trigger async agent turn
    const sessionKey = await resolveSessionKeyById(runtime.sessionId!, topicId)
      || `agent:main:main`
    triggerAgentTurn(sessionKey, payload)

    return Response.json({
      ok: true,
      queued: true,
      channel,
      topicId: topicId || null,
      sessionId: runtime.sessionId,
      messageId,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
