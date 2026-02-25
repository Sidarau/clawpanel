import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const getUserMdPath = () => join(homedir(), '.openclaw', 'workspace', 'USER.md')

export async function GET() {
  try {
    const content = await readFile(getUserMdPath(), 'utf-8')
    return Response.json({ content })
  } catch {
    return Response.json({ content: '', error: 'File not found' })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (typeof body.content !== 'string') {
      return Response.json({ error: 'Missing content field' }, { status: 400 })
    }
    await writeFile(getUserMdPath(), body.content, 'utf-8')
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
