import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const JOBS_PATH = join(homedir(), '.openclaw', 'cron', 'jobs.json')

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const jobId = String(body?.jobId || '')
    const model = String(body?.model || '')

    if (!jobId || !model) return Response.json({ error: 'jobId and model required' }, { status: 400 })
    if (model.startsWith('code/')) return Response.json({ error: 'Code jobs cannot set LLM model' }, { status: 400 })

    const raw = await readFile(JOBS_PATH, 'utf-8')
    const data = JSON.parse(raw)
    const jobs = data?.jobs ?? []

    const idx = jobs.findIndex((j: any) => String(j.id) === jobId)
    if (idx === -1) return Response.json({ error: 'Job not found' }, { status: 404 })

    const job = jobs[idx]
    if (!job.payload) job.payload = {}
    if (String(job.payload.kind || '') === 'systemEvent') {
      return Response.json({ error: 'System event jobs do not use LLM models' }, { status: 400 })
    }

    job.payload.model = model
    job.updatedAtMs = Date.now()

    await writeFile(JOBS_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
