import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

type TranscriptMsg = { role: string; content: string; ts?: number | string }

function extractContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (typeof c === 'string') return c
        if (c?.type === 'text' && typeof c?.text === 'string') return c.text
        if (typeof c?.text === 'string') return c.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') return JSON.stringify(content)
  return ''
}

function parseLine(entry: any): TranscriptMsg | null {
  // Format A: { role, content, ts }
  if (entry?.role && entry?.content !== undefined) {
    const text = extractContent(entry.content)
    if (!text.trim()) return null
    return { role: String(entry.role), content: text, ts: entry.ts || entry.timestamp }
  }

  // Format B: { type:"message", message:{ role, content }, timestamp }
  if (entry?.type === 'message' && entry?.message?.role) {
    const text = extractContent(entry.message.content)
    if (!text.trim()) return null
    return {
      role: String(entry.message.role),
      content: text,
      ts: entry.timestamp || entry.ts,
    }
  }

  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  const agentId = url.searchParams.get('agentId')

  if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

  try {
    const home = homedir()

    const agentDirs = agentId ? [agentId] : []
    const { readdirSync } = require('fs')
    const agentsDir = join(home, '.openclaw', 'agents')
    try {
      const dirs = readdirSync(agentsDir)
      for (const d of dirs) {
        if (!agentDirs.includes(d)) agentDirs.push(d)
      }
    } catch {}

    let messages: TranscriptMsg[] = []

    for (const agent of agentDirs) {
      const sessionPath = join(agentsDir, agent, 'sessions', `${sessionId}.jsonl`)
      try {
        const raw = await readFile(sessionPath, 'utf-8')
        const lines = raw.trim().split('\n').filter(Boolean)

        const parsed: TranscriptMsg[] = []
        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            const msg = parseLine(entry)
            if (msg && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')) {
              parsed.push(msg)
            }
          } catch {}
        }

        if (parsed.length > 0) {
          messages = parsed
          break
        }
      } catch {
        continue
      }
    }

    if (messages.length === 0) {
      return Response.json({ error: 'Session transcript not found', sessionId }, { status: 404 })
    }

    return Response.json({ sessionId, messages, total: messages.length })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
