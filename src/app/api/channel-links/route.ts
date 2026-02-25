import { randomUUID } from 'crypto'
import { getAllChannelLinks, getChannelLink, upsertChannelLink } from '@/lib/channel-links'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const channel = String(url.searchParams.get('channel') || '').trim()

    if (channel) {
      const link = await getChannelLink(channel)
      return Response.json({ channel, link })
    }

    const links = await getAllChannelLinks({ includeDefaults: true })
    return Response.json({ links })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const channel = String(body?.channel || '').trim()
    if (!channel) {
      return Response.json({ error: 'Missing channel' }, { status: 400 })
    }

    const sessionId = body?.sessionId ? String(body.sessionId).trim() : undefined
    const autoSession = Boolean(body?.autoSession)

    const existing = await getChannelLink(channel)

    const finalSessionId = sessionId
      || existing?.sessionId
      || (autoSession ? randomUUID() : undefined)

    const link = await upsertChannelLink({
      channel,
      sessionId: finalSessionId,
      telegramTopicId: body?.telegramTopicId ? String(body.telegramTopicId).trim() : undefined,
      telegramThreadId: body?.telegramThreadId ? String(body.telegramThreadId).trim() : undefined,
      telegramChatId: body?.telegramChatId ? String(body.telegramChatId).trim() : undefined,
    })

    return Response.json({ ok: true, link })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
