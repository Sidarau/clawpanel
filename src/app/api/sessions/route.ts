import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

interface SessionSummary {
  id: string
  agentId: string
  file: string
  sizeKB: number
  created: string
  messageCount: number
  preview: string
}

interface SessionMessage {
  id: string
  role: string
  text: string
  timestamp: string
  model?: string
  provider?: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const agentId = url.searchParams.get('agent')
  const sessionId = url.searchParams.get('session')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 50

  const home = homedir()

  // If session ID provided, return messages
  if (agentId && sessionId) {
    return getSessionMessages(home, agentId, sessionId, limit)
  }

  // If agent ID provided, list sessions for that agent
  if (agentId) {
    return listSessions(home, agentId)
  }

  return Response.json({ error: 'Missing agent param' }, { status: 400 })
}

async function listSessions(home: string, agentId: string): Promise<Response> {
  try {
    const sessDir = join(home, '.openclaw', 'agents', agentId, 'sessions')
    const files = await readdir(sessDir)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.endsWith('.lock'))

    const sessions: SessionSummary[] = []
    for (const file of jsonlFiles.slice(0, 20)) {
      try {
        const filePath = join(sessDir, file)
        const fstat = await stat(filePath)
        const raw = await readFile(filePath, 'utf-8')
        const lines = raw.trim().split('\n')

        // Count messages and get preview
        let msgCount = 0
        let preview = ''
        let created = ''

        for (const line of lines.slice(0, 100)) {
          try {
            const obj = JSON.parse(line)
            if (obj.type === 'session' && obj.timestamp) created = obj.timestamp
            if (obj.type === 'message') {
              msgCount++
              if (!preview && obj.message?.content) {
                const content = obj.message.content
                if (typeof content === 'string') preview = content.slice(0, 100)
                else if (Array.isArray(content)) {
                  const text = content.find((c: Record<string, unknown>) => c.type === 'text')
                  if (text) preview = (text.text as string).slice(0, 100)
                }
              }
            }
          } catch {}
        }

        // Estimate total messages from file (each message ~avg bytes)
        const totalLines = lines.length
        const estMessages = Math.max(msgCount, Math.floor(totalLines * 0.4))

        sessions.push({
          id: file.replace('.jsonl', ''),
          agentId,
          file,
          sizeKB: Math.round(fstat.size / 1024),
          created: created || fstat.birthtime.toISOString(),
          messageCount: estMessages,
          preview,
        })
      } catch {}
    }

    sessions.sort((a, b) => b.created.localeCompare(a.created))
    return Response.json({ sessions })
  } catch {
    return Response.json({ sessions: [] })
  }
}

async function getSessionMessages(home: string, agentId: string, sessionId: string, limit: number): Promise<Response> {
  try {
    const filePath = join(home, '.openclaw', 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
    const raw = await readFile(filePath, 'utf-8')
    const lines = raw.trim().split('\n')

    const messages: SessionMessage[] = []
    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (obj.type !== 'message') continue
        const msg = obj.message
        if (!msg) continue

        let text = ''
        if (typeof msg.content === 'string') text = msg.content
        else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((c: Record<string, unknown>) => c.type === 'text')
            .map((c: Record<string, unknown>) => c.text)
            .join('\n')
        }

        if (!text.trim()) continue

        messages.push({
          id: obj.id || String(messages.length),
          role: msg.role || 'unknown',
          text: text.slice(0, 2000), // Cap per-message size
          timestamp: obj.timestamp || '',
          model: msg.model,
          provider: msg.provider,
        })
      } catch {}
    }

    // Return last N messages
    const result = messages.slice(-limit)
    return Response.json({ messages: result, total: messages.length })
  } catch {
    return Response.json({ messages: [], total: 0 })
  }
}
