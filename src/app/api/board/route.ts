import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join, dirname } from 'path'

const BOARD_PATH = join(homedir(), '.openclaw', 'workspace', 'todo', 'board.json')

// Project → ticket prefix mapping
const PROJECT_PREFIX: Record<string, string> = {
  'clawpanel': 'CP',
  'crm': 'CRM',
  'kb-drops': 'KB',
  'authority-engine': 'AE',
  'x-research': 'XR',
  'zeug-analytics': 'ZA',
  'music-promo': 'MP',
  'veles': 'VL',
  'job-search': 'JS',
  'social-research': 'SR',
  'content-pipeline': 'CPL',
  'infra': 'INF',
  'general': 'GEN',
  'morning-brief': 'MB',
  'forge': 'FRG',
  'minerva': 'MIN',
}

// Default board state — used to seed board.json on first run
const DEFAULT_BOARD = {
  nextTicketNum: 21, // start after pre-seeded tickets
  columns: [
    { id: 'backlog', label: 'Backlog', color: '#6b7280', cards: [
      { id: 'k-cp-cloudflare', ticketId: 'CP-001', title: 'Cloudflare Access auth gate',     project: 'clawpanel',        assignee: 'Alex',  description: 'Create Cloudflare account and set up Zero Trust auth for cp.zeuglab.com. Currently using basic auth (temp).' },
      { id: 'k-cp-settings',   ticketId: 'CP-002', title: 'Settings page (MD file editor)', project: 'clawpanel',        assignee: 'Eve',   description: 'Edit SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md directly from ClawPanel. In-app code editor.' },
      { id: 'k-cp-dashboard',  ticketId: 'CP-003', title: 'Dashboard KPIs',                 project: 'clawpanel',        assignee: 'Eve',   description: 'Active agents, token costs, tasks by bucket, recent activity feed.' },
      { id: 'k-crm-ghl',       ticketId: 'CRM-001', title: 'GoHighLevel API integration',    project: 'crm',              assignee: 'Alex',  description: 'Need Private Integration Token from Alex to proceed. BLOCKER.' },
      { id: 'k-kb-youtube',    ticketId: 'KB-001', title: 'YouTube channels list',          project: 'kb-drops',         assignee: 'Alex',  description: 'Provide list of YouTube channels to monitor for KB Drops ingestion. 3+ days waiting.' },
      { id: 'k-kb-llm',        ticketId: 'KB-002', title: 'LLM answer generation w/ citations', project: 'kb-drops',     assignee: 'Eve',   description: 'Generate answers from KB with source citations. Builds on existing RAG search.' },
      { id: 'k-ae-xbio',       ticketId: 'AE-001', title: 'X bio + header + pinned post',   project: 'authority-engine', assignee: 'Alex',  description: 'Define who you help, proof points, hook. Header: simple promise/position.' },
      { id: 'k-ae-linkedin',   ticketId: 'AE-002', title: 'LinkedIn profile optimization',  project: 'authority-engine', assignee: 'Alex',  description: 'Headline, about section, featured projects, keywords for $150k+ roles.' },
      { id: 'k-za-channels',   ticketId: 'ZA-001', title: 'Define first 10 channels/tickers', project: 'zeug-analytics', assignee: 'Alex',  description: 'Pick YouTube channels, X accounts, and stock tickers to monitor.' },
      { id: 'k-za-briefs',     ticketId: 'ZA-002', title: 'Build ingestion + brief pipeline', project: 'zeug-analytics', assignee: 'Eve',   description: 'Caching, dedupe, scoring, brief format. Start with read-only dashboard + Telegram alerts.' },
      { id: 'k-mp-offers',     ticketId: 'MP-001', title: 'Define 1-2 promo offers',        project: 'music-promo',      assignee: 'Alex',  description: 'Document capabilities, differentiators. Clear outcome + price for each offer.' },
      { id: 'k-vl-bind',       ticketId: 'VL-001', title: 'Bind Veles to Telegram topic',   project: 'veles',            assignee: 'Eve',   description: 'Connect humanizer to c/veles Telegram topic. Test humanization workflow end-to-end.' },
    ]},
    { id: 'in-progress', label: 'In Progress', color: '#3b82f6', cards: [
      { id: 'k-cp-ui',    ticketId: 'CP-004', title: 'ClawPanel UI redesign (v3)',      project: 'clawpanel',  assignee: 'Eve',  description: 'Premium UI — glass cards, real APIs, agent detail, board filters, expandable cards. Active iteration with Alex.' },
      { id: 'k-cp-dedup', ticketId: 'XR-001', title: 'Content pipeline dedup',          project: 'x-research', assignee: 'Eve',  description: 'Hybrid semantic dedup (70/30 split) with 40% similarity hard gate for content ideas.' },
      { id: 'k-js-system',ticketId: 'JS-001', title: 'Job search automation system',    project: 'job-search', assignee: 'Eve',  description: 'Alerts, tracker, outreach templates, resume variants for $150k+ roles.' },
    ]},
    { id: 'review', label: 'Review', color: '#f59e0b', cards: [
      { id: 'k-cp-agents', ticketId: 'CP-005', title: 'Agents page + detail view', project: 'clawpanel', assignee: 'Alex', description: 'Real models, grouped by workflow, sort toggle, drill into agent detail. Needs Alex QA on iPhone.' },
    ]},
    { id: 'done', label: 'Done', color: '#10b981', cards: [
      { id: 'k-cp-build', ticketId: 'CP-006', title: 'Initial frontend build',       project: 'clawpanel',  assignee: 'Eve', description: 'First ClawPanel build — iOS Settings style, all 7 acceptance criteria verified.' },
      { id: 'k-kb-rag',   ticketId: 'KB-003', title: 'KB-drops RAG search',          project: 'kb-drops',   assignee: 'Eve', description: 'Personal knowledge base with RAG search via kb query CLI. Semantic + keyword hybrid.' },
      { id: 'k-cp-apis',  ticketId: 'CP-007', title: 'Real gateway/agent/cron APIs', project: 'clawpanel',  assignee: 'Eve', description: 'Gateway status reads from config, agents show real models, cron reads jobs.json.' },
      { id: 'k-sr-tool',  ticketId: 'XR-002', title: 'Social research tool (tiered)',project: 'x-research', assignee: 'Eve', description: 'Cost-optimized Twitter/X research with tiered API retrieval.' },
    ]},
  ],
  updatedAt: new Date().toISOString(),
}

// Note: PROJECT_PREFIX is duplicated in action/route.ts since Next.js route files can't export non-handler values

async function readBoard() {
  try {
    const raw = await readFile(BOARD_PATH, 'utf-8')
    const data = JSON.parse(raw)
    // Migration: add ticketIds to existing cards that don't have them
    let needsSave = false
    let nextNum = data.nextTicketNum || 21
    for (const col of data.columns || []) {
      for (const card of col.cards || []) {
        if (!card.ticketId) {
          const prefix = PROJECT_PREFIX[card.project] || 'GEN'
          card.ticketId = `${prefix}-${String(nextNum).padStart(3, '0')}`
          nextNum++
          needsSave = true
        }
      }
    }
    if (needsSave) {
      data.nextTicketNum = nextNum
      data.updatedAt = new Date().toISOString()
      await writeFile(BOARD_PATH, JSON.stringify(data, null, 2), 'utf-8')
    }
    return data
  } catch {
    // First run — seed the file
    await mkdir(dirname(BOARD_PATH), { recursive: true })
    const data = { ...DEFAULT_BOARD, updatedAt: new Date().toISOString() }
    await writeFile(BOARD_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return data
  }
}

// GET — read board state
export async function GET() {
  try {
    const data = await readBoard()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

function buildCardColumnMap(columns: Array<{ id?: string; cards?: Array<{ id?: string }> }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const col of columns || []) {
    if (!col?.id || !Array.isArray(col.cards)) continue
    for (const card of col.cards) {
      if (!card?.id) continue
      map.set(card.id, col.id)
    }
  }
  return map
}

// POST — write board state
export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Validate structure
    if (!body.columns || !Array.isArray(body.columns)) {
      return Response.json({ error: 'Invalid board data: missing columns array' }, { status: 400 })
    }

    for (const col of body.columns) {
      if (!col.id || !col.label || !Array.isArray(col.cards)) {
        return Response.json({ error: `Invalid column: ${JSON.stringify(col).slice(0, 100)}` }, { status: 400 })
      }
    }

    const current = await readBoard()

    // Optimistic concurrency guard: reject stale snapshots
    const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : null
    if (baseUpdatedAt && current?.updatedAt && baseUpdatedAt !== current.updatedAt) {
      return Response.json({
        error: 'stale_write_rejected',
        message: 'Board changed since this client loaded it. Refresh and retry.',
        currentUpdatedAt: current.updatedAt,
      }, { status: 409 })
    }

    // Durability guard: do not silently regress done cards unless explicitly allowed
    const currentMap = buildCardColumnMap(current.columns || [])
    const nextMap = buildCardColumnMap(body.columns)
    const blockedDoneRegressions: Array<{ cardId: string; reason: string; toColumn: string | null }> = []

    for (const [cardId, currentCol] of Array.from(currentMap.entries())) {
      if (currentCol !== 'done') continue
      const nextCol = nextMap.get(cardId) || null
      if (nextCol === 'done') continue
      if (!nextCol) {
        blockedDoneRegressions.push({ cardId, reason: 'missing_from_payload', toColumn: null })
      } else {
        blockedDoneRegressions.push({ cardId, reason: 'done_regression', toColumn: nextCol })
      }
    }

    if (blockedDoneRegressions.length > 0 && body.allowReopen !== true) {
      return Response.json({
        error: 'done_regression_blocked',
        message: 'Done cards cannot move backward without explicit reopen/review flow.',
        blocked: blockedDoneRegressions,
      }, { status: 409 })
    }

    const data = {
      ...current,
      columns: body.columns,
      updatedAt: new Date().toISOString(),
    }

    await mkdir(dirname(BOARD_PATH), { recursive: true })
    await writeFile(BOARD_PATH, JSON.stringify(data, null, 2), 'utf-8')

    return Response.json({ ok: true, updatedAt: data.updatedAt })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
