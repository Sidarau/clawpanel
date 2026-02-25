import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const channel = formData.get('channel') as string | null

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin'
    const id = randomUUID().slice(0, 8)
    const filename = `${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    await mkdir(UPLOAD_DIR, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(UPLOAD_DIR, filename), buffer)

    // Determine file type
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp|heic)$/i.test(file.name)
    const isPdf = /\.pdf$/i.test(file.name)

    return Response.json({
      ok: true,
      file: {
        id,
        name: file.name,
        filename,
        size: file.size,
        type: file.type,
        isImage,
        isPdf,
        url: `/uploads/${filename}`,
        channel: channel || null,
        uploadedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
