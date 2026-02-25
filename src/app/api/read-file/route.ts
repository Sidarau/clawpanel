import { readFile } from 'fs/promises'
import { normalize } from 'path'

const ROOT = '/home/ubuntu/.openclaw/workspace'

function isSafePath(abs: string): boolean {
  const n = normalize(abs)
  return n.startsWith(normalize(ROOT + '/'))
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const path = (url.searchParams.get('path') || '').trim()
    if (!path) return Response.json({ error: 'Missing path' }, { status: 400 })
    if (!isSafePath(path)) return Response.json({ error: 'Path not allowed' }, { status: 400 })

    const content = await readFile(path, 'utf-8')
    return Response.json({ path, content })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
