import { appendFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join, dirname } from 'path'

const ACTIONS_PATH = join(homedir(), '.openclaw', 'workspace', 'todo', 'board-actions.jsonl')
const COMMENTS_DIR = join(homedir(), '.openclaw', 'workspace', 'todo', 'comments')

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { cardId, cardTitle, ticketId, project, assignee, fromColumn, toColumn, action, notes } = body

    if (!cardId || !action) {
      return Response.json({ error: 'Missing cardId or action' }, { status: 400 })
    }

    const ts = new Date().toISOString()

    const event = {
      ts,
      cardId,
      ticketId: ticketId || null,
      cardTitle: cardTitle || '',
      project: project || '',
      assignee: assignee || '',
      fromColumn: fromColumn || null,
      toColumn: toColumn || null,
      action, // 'move' | 'delete' | 'note'
      notes: notes || null,
    }

    await mkdir(dirname(ACTIONS_PATH), { recursive: true })
    await appendFile(ACTIONS_PATH, JSON.stringify(event) + '\n', 'utf-8')

    // For notes and moves, also write to project chat comments file
    // This allows the chat view to show board activity inline
    if (project && (action === 'note' || action === 'move')) {
      await mkdir(COMMENTS_DIR, { recursive: true })
      const commentFile = join(COMMENTS_DIR, `${project}.jsonl`)
      const chatEntry = {
        ts,
        type: 'board-activity',
        ticketId: ticketId || cardId,
        cardTitle: cardTitle || '',
        action,
        ...(action === 'note' ? {
          sender: assignee || 'Unknown',
          text: notes,
        } : {
          text: `${assignee || 'Someone'} moved "${cardTitle}" from ${fromColumn} → ${toColumn}`,
        }),
      }
      await appendFile(commentFile, JSON.stringify(chatEntry) + '\n', 'utf-8')
    }

    return Response.json({ ok: true, queued: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
