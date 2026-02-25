import { readFile, readdir, stat } from 'fs/promises'
import { join, normalize } from 'path'

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/ubuntu/.openclaw/workspace'

function excerpt(content: string, q?: string): string {
  const cleaned = content.trim()
  if (!q) return cleaned.slice(0, 420)

  const lower = cleaned.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx === -1) return cleaned.slice(0, 420)

  const start = Math.max(0, idx - 160)
  const end = Math.min(cleaned.length, idx + 260)
  return `${start > 0 ? '…' : ''}${cleaned.slice(start, end)}${end < cleaned.length ? '…' : ''}`
}

function safeWorkspacePath(rel: string): string | null {
  const cleaned = rel.replace(/^\/+/, '')
  const abs = normalize(join(WORKSPACE_ROOT, cleaned))
  if (!abs.startsWith(normalize(WORKSPACE_ROOT + '/'))) return null
  return abs
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const filePath = (url.searchParams.get('path') || '').trim()

    // Full file read mode for expandable view
    if (filePath) {
      const abs = safeWorkspacePath(filePath)
      if (!abs) return Response.json({ error: 'Invalid path' }, { status: 400 })

      const content = await readFile(abs, 'utf-8')
      const st = await stat(abs)
      return Response.json({
        path: filePath,
        updatedAt: st.mtime.toISOString(),
        content,
      })
    }

    const docs: Array<{ path: string; updatedAt: string; excerpt: string }> = []

    const candidates: string[] = [join(WORKSPACE_ROOT, 'MEMORY.md')]
    const memoryDir = join(WORKSPACE_ROOT, 'memory')

    try {
      const files = await readdir(memoryDir)
      for (const f of files.filter((x) => x.endsWith('.md'))) {
        candidates.push(join(memoryDir, f))
      }
    } catch {}

    for (const abs of candidates) {
      try {
        const [content, st] = await Promise.all([readFile(abs, 'utf-8'), stat(abs)])
        if (q && !content.toLowerCase().includes(q.toLowerCase())) continue

        docs.push({
          path: abs.replace(`${WORKSPACE_ROOT}/`, ''),
          updatedAt: st.mtime.toISOString(),
          excerpt: excerpt(content, q),
        })
      } catch {}
    }

    docs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

    return Response.json({ docs: docs.slice(0, 80) })
  } catch (err) {
    return Response.json({ error: String(err), docs: [] }, { status: 500 })
  }
}
