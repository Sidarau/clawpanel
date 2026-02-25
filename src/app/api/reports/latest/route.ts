import { NextResponse } from 'next/server'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

type Report = {
  id: string
  source: string
  title: string
  text: string
  timestamp: string
  sessionId: string
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

function sourceLabel(agentId: string): string {
  const map: Record<string, string> = {
    'morning-brief': 'Morning Brief',
    'afternoon-research': 'Afternoon Research',
    minerva: 'Minerva',
    janus: 'Janus',
    forge: 'Forge',
  }
  return map[agentId] || agentId.replace(/-/g, ' ')
}

function isExecutiveAgent(agentId: string): boolean {
  if (['morning-brief', 'afternoon-research', 'minerva', 'janus', 'forge'].includes(agentId)) return true
  if (agentId.includes('brief') || agentId.includes('research')) return true
  return false
}

function looksExecutive(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^heartbeat_ok$/i.test(t)) return false
  if (/\[source:\s*clawpanel web chat\]/i.test(t)) return false
  if (/\[\[\s*reply_to/i.test(t)) return false
  if (t.length < 140) return false

  const lower = t.toLowerCase()
  const keywords = [
    'executive snapshot', 'summary', 'analysis', 'status', 'update', 'blocker',
    'risk', 'next action', 'recommend', 'decision', 'milestone', 'completed',
  ]

  let hits = 0
  for (const k of keywords) {
    if (lower.includes(k)) hits += 1
  }

  return hits >= 1 || /\n\s*[-*]\s+/.test(t) || /\n\s*\d+[\).]\s+/.test(t)
}

export async function GET() {
  try {
    const reports: Report[] = []
    const agentsRoot = join(homedir(), '.openclaw', 'agents')

    // 1) Pull recent assistant messages from session JSONL files across agents.
    const candidateFiles: Array<{ agentId: string; file: string; path: string; mtimeMs: number }> = []

    try {
      const agentIds = await readdir(agentsRoot)
      for (const agentId of agentIds) {
        const sessionsDir = join(agentsRoot, agentId, 'sessions')
        let files: string[] = []
        try {
          files = await readdir(sessionsDir)
        } catch {
          continue
        }

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          if (file.endsWith('.lock')) continue
          if (file.includes('.deleted.')) continue
          try {
            const s = await stat(join(sessionsDir, file))
            candidateFiles.push({
              agentId,
              file,
              path: join(sessionsDir, file),
              mtimeMs: s.mtimeMs,
            })
          } catch {
            // skip file stat errors
          }
        }
      }
    } catch {
      // ignore filesystem discovery errors
    }

    candidateFiles.sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const c of candidateFiles.slice(0, 160)) {
      try {
        if (!isExecutiveAgent(c.agentId)) continue

        const raw = await readFile(c.path, 'utf-8')
        const lines = raw.split('\n').filter(Boolean)
        if (!lines.length) continue

        let lastAssistant: { text: string; timestamp: string } | null = null
        for (let i = lines.length - 1; i >= 0; i--) {
          let obj: any
          try {
            obj = JSON.parse(lines[i])
          } catch {
            continue
          }
          if (obj?.type !== 'message') continue
          if (obj?.message?.role !== 'assistant') continue

          const text = parseMessageText(obj.message).trim()
          if (!text) continue

          lastAssistant = {
            text,
            timestamp: obj.timestamp || new Date(c.mtimeMs).toISOString(),
          }
          break
        }

        if (!lastAssistant) continue
        if (!looksExecutive(lastAssistant.text)) continue

        const sessionId = c.file.split('.')[0].split('-topic-')[0]
        reports.push({
          id: `${c.agentId}:${c.file}`,
          source: sourceLabel(c.agentId),
          title: c.file,
          text: lastAssistant.text,
          timestamp: lastAssistant.timestamp,
          sessionId,
        })
      } catch {
        // skip unreadable files
      }
    }

    // 2) Include recent cron summaries (if present).
    try {
      const cronJobsFile = join(homedir(), '.openclaw', 'cron', 'jobs.json')
      const cronRaw = await readFile(cronJobsFile, 'utf-8')
      const cron = JSON.parse(cronRaw)
      const jobs = Array.isArray(cron?.jobs) ? cron.jobs : []

      for (const job of jobs) {
        const jobName = String(job?.name || 'Cron')
        const lowerJob = jobName.toLowerCase()
        const isExecutiveJob = (
          lowerJob.includes('brief')
          || lowerJob.includes('research')
          || lowerJob.includes('snapshot')
          || lowerJob.includes('status')
          || lowerJob.includes('nightly')
        )
        if (!isExecutiveJob) continue

        const runs = Array.isArray(job?.runs) ? job.runs : []
        for (const run of runs.slice(-5)) {
          const summary = String(run?.summary || '').trim()
          if (!looksExecutive(summary)) continue
          const ts = typeof run?.ts === 'number' ? new Date(run.ts).toISOString() : (run?.ts || new Date().toISOString())
          reports.push({
            id: `cron:${job?.id || 'job'}:${ts}`,
            source: jobName,
            title: jobName,
            text: summary,
            timestamp: ts,
            sessionId: String(run?.sessionId || `cron-${job?.id || 'job'}`),
          })
        }
      }
    } catch {
      // cron file optional
    }

    reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // De-duplicate by identical text+timestamp-ish
    const seen = new Set<string>()
    const deduped: Report[] = []
    for (const r of reports) {
      const key = `${r.source}|${r.timestamp}|${r.text.slice(0, 180)}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(r)
      if (deduped.length >= 20) break
    }

    return NextResponse.json(deduped)
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch reports: ${String(error)}` }, { status: 500 })
  }
}
