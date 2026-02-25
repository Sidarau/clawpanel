import { readdir, readFile } from 'fs/promises'
import { join, basename, normalize } from 'path'

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/ubuntu/.openclaw/workspace'
const GRAPH_ROOT = join(WORKSPACE_ROOT, 'skill-graph')

type Node = {
  id: string
  title: string
  description: string
  links: string[]
}

function parseFrontmatterDescription(content: string): string {
  if (!content.startsWith('---')) return ''
  const end = content.indexOf('\n---', 3)
  if (end === -1) return ''
  const fm = content.slice(3, end)
  const line = fm.split('\n').find((l) => l.trim().startsWith('description:'))
  return line ? line.split(':').slice(1).join(':').trim().replace(/^"|"$/g, '') : ''
}

function parseTitle(content: string, fallback: string): string {
  const line = content.split('\n').find((l) => l.trim().startsWith('# '))
  return line ? line.replace(/^#\s+/, '').trim() : fallback
}

function parseWikiLinks(content: string): string[] {
  const out = new Set<string>()
  const regex = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    const raw = m[1].trim()
    if (!raw) continue
    const normalized = raw.split('|')[0].trim().replace(/^\.\//, '')
    out.add(normalized)
  }
  return Array.from(out)
}

function safeNodePath(id: string): string | null {
  const safeId = id.replace(/\.md$/i, '')
  const abs = normalize(join(GRAPH_ROOT, `${safeId}.md`))
  if (!abs.startsWith(normalize(GRAPH_ROOT + '/'))) return null
  return abs
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const nodeId = (url.searchParams.get('id') || '').trim()

    // Full node read mode for expandable text
    if (nodeId) {
      const abs = safeNodePath(nodeId)
      if (!abs) return Response.json({ error: 'Invalid node id' }, { status: 400 })

      const content = await readFile(abs, 'utf-8')
      return Response.json({ id: nodeId, content })
    }

    const files = await readdir(GRAPH_ROOT)
    const mdFiles = files.filter((f) => f.endsWith('.md'))

    const nodes: Node[] = []
    for (const file of mdFiles) {
      const abs = join(GRAPH_ROOT, file)
      const content = await readFile(abs, 'utf-8')
      const id = basename(file, '.md')
      nodes.push({
        id,
        title: parseTitle(content, id),
        description: parseFrontmatterDescription(content),
        links: parseWikiLinks(content),
      })
    }

    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges: Array<{ from: string; to: string }> = []

    for (const n of nodes) {
      for (const link of n.links) {
        if (nodeIds.has(link)) edges.push({ from: n.id, to: link })
      }
    }

    const inboundCounts = new Map<string, number>()
    for (const n of nodes) inboundCounts.set(n.id, 0)
    for (const e of edges) inboundCounts.set(e.to, (inboundCounts.get(e.to) || 0) + 1)

    return Response.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        out: n.links.filter((l) => nodeIds.has(l)).length,
        inbound: inboundCounts.get(n.id) || 0,
      })),
      edgeCount: edges.length,
      root: 'skill-graph',
    })
  } catch {
    return Response.json({ nodes: [], edgeCount: 0, root: 'skill-graph' })
  }
}
