'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Monitor, Search, Zap, Users, FileText, Book, BarChart3,
  Clock, Grid3X3, Power, Send, Bot, RefreshCw, Server,
  ChevronRight, ChevronDown, AlertTriangle, Activity, ArrowUpDown,
  Folder, Terminal, Wifi, WifiOff, Plus, Trash2, Check, RotateCcw, ArrowLeft,
  GitBranch, Upload, Paperclip, Eye, Settings, Key, CreditCard, User2, LogOut, Save, Shield, CalendarDays,
  Mic, MicOff,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'

// ─── Types ──────────────────────────────────────────────
type Channel = { id: string; name: string; prefix: string; icon: React.ReactNode; lastMsg: string; unread: number; color: string }
type KanbanCard = { id: string; ticketId?: string; title: string; project: string; assignee: string; description?: string; priority?: 'low' | 'med' | 'high' }
type KanbanCol = { id: string; label: string; color: string; cards: KanbanCard[] }

type AgentInfo = {
  id: string
  name: string
  model: string
  hasSessions: boolean
  group: string
  activity?: 'active' | 'queued' | 'idle' | 'stale'
  lastActiveAt?: string | null
  runningSteps?: number
  queuedSteps?: number
  scheduledJobs?: number
}
type AgentSummary = {
  total: number
  active: number
  queued: number
  scheduled?: number
  idle: number
  stale: number
  activeRuns: number
  runningSteps: number
  queuedSteps: number
  failedWorkflows: number
}
type WorkflowHealth = {
  id: string
  status: 'running' | 'failed' | 'completed' | 'idle'
  activeRuns: number
  runningSteps: number
  queuedSteps: number
  failedRuns: number
  completedRuns: number
  lastRunStatus: string | null
  lastRunAt: string | null
}
type CronJob = { id: string; name: string; enabled: boolean; schedule: string; tz: string; model: string; status: 'active' | 'error' | 'disabled'; lastRun: string | null; nextRun: string | null; consecutiveErrors: number; agentId: string }
type GatewayStatus = { status: 'online' | 'offline'; port: number; uptime: number | null }
type CalendarJob = { id: string; name: string; enabled: boolean; tz: string; scheduleKind: 'cron' | 'every' | 'at' | 'unknown'; scheduleExpr: string; everyMs?: number; nextRun: string | null; isService: boolean }
type SortKey = 'name' | 'status' | 'model' | 'group'

type WorkflowInfo = {
  id: string
  name: string
  description: string
  version: number
  agents: Array<{ id: string; name: string; role: string; description: string; model?: string }>
  runtime?: {
    status: 'running' | 'failed' | 'completed' | 'idle'
    activeRuns: number
    runningSteps: number
    queuedSteps: number
    failedRuns: number
    completedRuns: number
    lastRunStatus: string | null
    lastRunAt: string | null
    lastTask?: string | null
    lastFailedStep?: string | null
    lastError?: string | null
  }
}
type CronDetail = { id: string; name: string; enabled: boolean; agentId: string; schedule: Record<string, unknown>; payload: { model: string; explicitModel?: string | null; modelSource?: string; editableModel?: boolean; thinking: string; prompt: string }; delivery: Record<string, unknown>; state: Record<string, unknown>; runs: Array<{ ts: number; status: string; summary?: string; error?: string; durationMs?: number; sessionId?: string; sessionKey?: string }> }

type Screen =
  | { type: 'home' }
  | { type: 'projects'; sub: 'chats' | 'board'; filter?: string }
  | { type: 'chat'; channelId: string }
  | { type: 'agents'; sort?: SortKey }
  | { type: 'agentDetail'; agentId: string }
  | { type: 'cron' }
  | { type: 'calendar' }
  | { type: 'cronDetail'; jobId: string }
  | { type: 'workflows' }
  | { type: 'squadSettings'; workflowId?: string }
  | { type: 'memory' }
  | { type: 'timeline' }
  | { type: 'observability' }
  | { type: 'skillGraph' }
  | { type: 'gateway' }
  | { type: 'kpis' }
  | { type: 'settings' }
  | { type: 'killswitch' }

// ─── Mock data ──────────────────────────────────────────
const CHANNELS: Channel[] = [
  { id: 'general',           name: 'General',           prefix: '',    icon: <MessageSquare size={14} />, lastMsg: 'System online',               unread: 0, color: '#10b981' },
  { id: 'clawpanel',         name: 'clawpanel',         prefix: 'p/', icon: <Monitor size={14} />,       lastMsg: 'UI v3 iteration in progress',  unread: 2, color: '#3b82f6' },
  { id: 'x-research',        name: 'x-research',        prefix: 'p/', icon: <Search size={14} />,        lastMsg: 'Content pipeline ready',       unread: 0, color: '#8b5cf6' },
  { id: 'authority-engine',   name: 'authority-engine',   prefix: 'p/', icon: <Zap size={14} />,           lastMsg: 'Positioning needed',           unread: 1, color: '#f59e0b' },
  { id: 'crm',               name: 'crm',               prefix: 'p/', icon: <Users size={14} />,          lastMsg: 'Blocked on GHL token',         unread: 0, color: '#ec4899' },
  { id: 'veles',             name: 'veles',             prefix: 'c/', icon: <FileText size={14} />,       lastMsg: 'Humanizer active',             unread: 0, color: '#14b8a6' },
  { id: 'kb-drops',          name: 'kb-drops',          prefix: 'p/', icon: <Book size={14} />,           lastMsg: 'Waiting on YouTube channels',   unread: 3, color: '#f97316' },
  { id: 'social-research',   name: 'social-research',   prefix: 'p/', icon: <BarChart3 size={14} />,      lastMsg: 'Tiered retrieval working',     unread: 0, color: '#06b6d4' },
  { id: 'job-search',        name: 'job-search',        prefix: 'p/', icon: <Folder size={14} />,         lastMsg: 'Automation system WIP',        unread: 0, color: '#a855f7' },
  { id: 'zeug-analytics',    name: 'zeug-analytics',    prefix: 'p/', icon: <BarChart3 size={14} />,      lastMsg: 'Needs channel/ticker list',    unread: 0, color: '#0ea5e9' },
  { id: 'music-promo',       name: 'music-promo',       prefix: 'p/', icon: <Activity size={14} />,       lastMsg: 'Define offers',                unread: 0, color: '#e11d48' },
]

const KANBAN_COLS_INIT: KanbanCol[] = [
  { id: 'backlog', label: 'Backlog', color: '#6b7280', cards: [
    // ClawPanel
    { id: 'k-cp-cloudflare', title: 'Cloudflare Access auth gate',     project: 'clawpanel',  assignee: 'Alex',    description: 'Create Cloudflare account and set up Zero Trust auth for cp.zeuglab.com. Currently using basic auth (temp).' },
    { id: 'k-cp-settings',   title: 'Settings page (MD file editor)', project: 'clawpanel',  assignee: 'Eve',     description: 'Edit SOUL.md, USER.md, TOOLS.md, HEARTBEAT.md directly from ClawPanel. In-app code editor.' },
    { id: 'k-cp-dashboard',  title: 'Dashboard KPIs',                 project: 'clawpanel',  assignee: 'Eve',     description: 'Active agents, token costs, tasks by bucket, recent activity feed.' },
    // CRM
    { id: 'k-crm-ghl',       title: 'GoHighLevel API integration',    project: 'crm',        assignee: 'Alex',    description: 'Need Private Integration Token from Alex to proceed. BLOCKER.' },
    // KB Drops
    { id: 'k-kb-youtube',    title: 'YouTube channels list',          project: 'kb-drops',   assignee: 'Alex',    description: 'Provide list of YouTube channels to monitor for KB Drops ingestion. 3+ days waiting.' },
    { id: 'k-kb-llm',        title: 'LLM answer generation w/ citations', project: 'kb-drops', assignee: 'Eve',  description: 'Generate answers from KB with source citations. Builds on existing RAG search.' },
    // Authority Engine
    { id: 'k-ae-xbio',       title: 'X bio + header + pinned post',   project: 'authority-engine', assignee: 'Alex', description: 'Define who you help, proof points, hook. Header: simple promise/position.' },
    { id: 'k-ae-linkedin',   title: 'LinkedIn profile optimization',  project: 'authority-engine', assignee: 'Alex', description: 'Headline, about section, featured projects, keywords for $150k+ roles.' },
    // Zeug Analytics
    { id: 'k-za-channels',   title: 'Define first 10 channels/tickers', project: 'zeug-analytics', assignee: 'Alex', description: 'Pick YouTube channels, X accounts, and stock tickers to monitor.' },
    { id: 'k-za-briefs',     title: 'Build ingestion + brief pipeline', project: 'zeug-analytics', assignee: 'Eve', description: 'Caching, dedupe, scoring, brief format. Start with read-only dashboard + Telegram alerts.' },
    // Music Promo
    { id: 'k-mp-offers',     title: 'Define 1-2 promo offers',        project: 'music-promo', assignee: 'Alex',   description: 'Document capabilities, differentiators. Clear outcome + price for each offer.' },
    // Veles
    { id: 'k-vl-bind',       title: 'Bind Veles to Telegram topic',   project: 'veles',      assignee: 'Eve',     description: 'Connect humanizer to c/veles Telegram topic. Test humanization workflow end-to-end.' },
  ]},
  { id: 'in-progress', label: 'In Progress', color: '#3b82f6', cards: [
    { id: 'k-cp-ui',         title: 'ClawPanel UI redesign (v3)',      project: 'clawpanel',   assignee: 'Eve',    description: 'Premium UI — glass cards, real APIs, agent detail, board filters, expandable cards. Active iteration with Alex.' },
    { id: 'k-cp-dedup',      title: 'Content pipeline dedup',          project: 'x-research',  assignee: 'Eve',    description: 'Hybrid semantic dedup (70/30 split) with 40% similarity hard gate for content ideas.' },
    { id: 'k-js-system',     title: 'Job search automation system',    project: 'job-search',  assignee: 'Eve',    description: 'Alerts, tracker, outreach templates, resume variants for $150k+ roles.' },
  ]},
  { id: 'review', label: 'Review', color: '#f59e0b', cards: [
    { id: 'k-cp-agents',     title: 'Agents page + detail view',       project: 'clawpanel',  assignee: 'Alex',   description: 'Real models, grouped by workflow, sort toggle, drill into agent detail. Needs Alex QA on iPhone.' },
  ]},
  { id: 'done', label: 'Done', color: '#10b981', cards: [
    { id: 'k-cp-build',      title: 'Initial frontend build',          project: 'clawpanel',  assignee: 'Eve',    description: 'First ClawPanel build — iOS Settings style, all 7 acceptance criteria verified.' },
    { id: 'k-kb-rag',        title: 'KB-drops RAG search',             project: 'kb-drops',   assignee: 'Eve',    description: 'Personal knowledge base with RAG search via kb query CLI. Semantic + keyword hybrid.' },
    { id: 'k-cp-apis',       title: 'Real gateway/agent/cron APIs',    project: 'clawpanel',  assignee: 'Eve',    description: 'Gateway status reads from config, agents show real models, cron reads jobs.json.' },
    { id: 'k-sr-tool',       title: 'Social research tool (tiered)',   project: 'x-research', assignee: 'Eve',    description: 'Cost-optimized Twitter/X research with tiered API retrieval.' },
  ]},
]

// ─── Animation ──────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const fadeUp = {
  hidden:  { opacity: 0, y: 10 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25, ease: EASE } }),
}

const pageTransition = {
  initial:  { opacity: 0, x: 10 },
  animate:  { opacity: 1, x: 0,  transition: { duration: 0.2, ease: EASE } },
  exit:     { opacity: 0, x: -6, transition: { duration: 0.14 } },
}

// ─── Shared ─────────────────────────────────────────────
const topBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--accent)',
  fontSize: '0.82rem', padding: '10px 12px', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', fontFamily: 'var(--font-jakarta), sans-serif',
}

const READ_COUNTS_KEY = 'clawpanel-read-counts-v1'

function LobsterLoader({ label = 'Loading…', minHeight = 260 }: { label?: string; minHeight?: number }) {
  return (
    <div style={{ minHeight, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 86, height: 58 }}>
          <motion.div
            animate={{ rotate: [-20, -5, -20] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', left: 6, top: 8, width: 24, height: 14,
              borderRadius: 999, border: '2px solid #fb7185', background: 'rgba(251,113,133,0.12)',
              transformOrigin: '100% 50%',
            }}
          />
          <motion.div
            animate={{ rotate: [20, 5, 20] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', right: 6, top: 8, width: 24, height: 14,
              borderRadius: 999, border: '2px solid #fb7185', background: 'rgba(251,113,133,0.12)',
              transformOrigin: '0% 50%',
            }}
          />
          <motion.div
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', left: '50%', top: 16, width: 34, height: 24,
              marginLeft: -17, borderRadius: 14,
              background: 'linear-gradient(180deg, #f43f5e 0%, #e11d48 100%)',
              boxShadow: '0 8px 22px rgba(225,29,72,0.3)',
            }}
          />
          <div style={{ position: 'absolute', left: '50%', top: 42, width: 30, marginLeft: -15, display: 'flex', justifyContent: 'space-between' }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 3, height: 8, borderRadius: 3, background: '#fb7185', opacity: 0.8 }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{label}</div>
      </div>
    </div>
  )
}

function loadReadCounts(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(READ_COUNTS_KEY) || '{}') } catch { return {} }
}

function saveReadCount(channelId: string, count: number) {
  if (typeof window === 'undefined') return
  const curr = loadReadCounts()
  curr[channelId] = Math.max(0, count)
  localStorage.setItem(READ_COUNTS_KEY, JSON.stringify(curr))
  window.dispatchEvent(new CustomEvent('clawpanel-read-updated'))
}

function shortModel(m: string): string {
  if (!m || m === 'default') return 'default'
  // "anthropic/claude-opus-4-6" → "claude-opus-4-6"
  const parts = m.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : m
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diff = d.getTime() - now
  const abs = Math.abs(diff)
  if (abs < 60000) return diff > 0 ? 'now' : 'just now'
  if (abs < 3600000) {
    const m = Math.round(abs / 60000)
    return diff > 0 ? `in ${m}m` : `${m}m ago`
  }
  if (abs < 86400000) {
    const h = Math.round(abs / 3600000)
    return diff > 0 ? `in ${h}h` : `${h}h ago`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function startOfUTCDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function isWeekendUTC(d: Date): boolean {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

function nthWeekdayOfMonthUTC(year: number, month: number, weekday: number, nth: number): Date {
  const d = new Date(Date.UTC(year, month, 1))
  const delta = (weekday - d.getUTCDay() + 7) % 7
  d.setUTCDate(1 + delta + (nth - 1) * 7)
  return d
}

function lastWeekdayOfMonthUTC(year: number, month: number, weekday: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0))
  const delta = (d.getUTCDay() - weekday + 7) % 7
  d.setUTCDate(d.getUTCDate() - delta)
  return d
}

function usHolidayNameUTC(d: Date): string | null {
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const day = d.getUTCDate()

  const fixed = new Map<string, string>([
    ['0-1', "New Year's Day"],
    ['5-19', 'Juneteenth'],
    ['6-4', 'Independence Day'],
    ['10-11', 'Veterans Day'],
    ['11-25', 'Christmas Day'],
  ])
  const key = `${month}-${day}`
  if (fixed.has(key)) return fixed.get(key)!

  const mlk = nthWeekdayOfMonthUTC(year, 0, 1, 3)
  if (month === mlk.getUTCMonth() && day === mlk.getUTCDate()) return 'MLK Day'

  const pres = nthWeekdayOfMonthUTC(year, 1, 1, 3)
  if (month === pres.getUTCMonth() && day === pres.getUTCDate()) return "Presidents' Day"

  const memorial = lastWeekdayOfMonthUTC(year, 4, 1)
  if (month === memorial.getUTCMonth() && day === memorial.getUTCDate()) return 'Memorial Day'

  const labor = nthWeekdayOfMonthUTC(year, 8, 1, 1)
  if (month === labor.getUTCMonth() && day === labor.getUTCDate()) return 'Labor Day'

  const columbus = nthWeekdayOfMonthUTC(year, 9, 1, 2)
  if (month === columbus.getUTCMonth() && day === columbus.getUTCDate()) return 'Columbus Day'

  const thanks = nthWeekdayOfMonthUTC(year, 10, 4, 4)
  if (month === thanks.getUTCMonth() && day === thanks.getUTCDate()) return 'Thanksgiving'

  return null
}

// ─── CenteredHeader ─────────────────────────────────────
function CenteredHeader({ title, onBack, titleColor }: {
  title: string; onBack: () => void; titleColor?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', alignItems: 'center', width: '100%', height: '100%' }}>
      <button onClick={onBack} style={{ ...topBtn, textAlign: 'left', padding: '10px 8px' }}>‹ Back</button>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-space-grotesk)', textAlign: 'center', color: titleColor }}>{title}</span>
      <span />
    </div>
  )
}

// ─── Root ───────────────────────────────────────────────
export default function Page() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' })
  const [kanbanCols, setKanbanCols] = useState<KanbanCol[]>(KANBAN_COLS_INIT)
  const [boardLoaded, setBoardLoaded] = useState(false)
  const boardVersionRef = useRef<string | null>(null)

  // Load board from API on mount
  useEffect(() => {
    fetch('/api/board')
      .then(r => r.json())
      .then(data => {
        boardVersionRef.current = data.updatedAt || null
        if (data.columns?.length) {
          // Merge API data — keep column metadata (label, color) from defaults, take cards from API
          const merged = KANBAN_COLS_INIT.map(defaultCol => {
            const apiCol = data.columns.find((c: KanbanCol) => c.id === defaultCol.id)
            return apiCol ? { ...defaultCol, cards: apiCol.cards } : defaultCol
          })
          setKanbanCols(merged)
        }
        setBoardLoaded(true)
      })
      .catch(() => setBoardLoaded(true))
  }, [])

  // Save board to API whenever columns change (after initial load)
  const saveBoardRef = useRef(false)
  useEffect(() => {
    if (!boardLoaded) return
    if (!saveBoardRef.current) { saveBoardRef.current = true; return } // skip first render after load
    const stripped = kanbanCols.map(col => ({
      id: col.id, label: col.label, color: col.color,
      cards: col.cards.map(c => ({ id: c.id, ticketId: c.ticketId, title: c.title, project: c.project, assignee: c.assignee, description: c.description })),
    }))
    fetch('/api/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: stripped, baseUpdatedAt: boardVersionRef.current }),
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json().catch(() => null)
          if (data?.updatedAt) boardVersionRef.current = data.updatedAt
          return
        }
        // Conflict path: refresh from source of truth, avoid stale overwrite loops
        if (r.status === 409) {
          const latest = await fetch('/api/board').then(x => x.json()).catch(() => null)
          if (latest?.columns?.length) {
            const merged = KANBAN_COLS_INIT.map(defaultCol => {
              const apiCol = latest.columns.find((c: KanbanCol) => c.id === defaultCol.id)
              return apiCol ? { ...defaultCol, cards: apiCol.cards } : defaultCol
            })
            boardVersionRef.current = latest.updatedAt || boardVersionRef.current
            saveBoardRef.current = false
            setKanbanCols(merged)
          }
        }
      })
      .catch(() => {})
  }, [kanbanCols, boardLoaded])

  const headerContent = () => {
    switch (screen.type) {
      case 'home':
        return <div style={{ width: '100%', height: '100%' }} />
      case 'projects':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', alignItems: 'center', width: '100%', height: '100%' }}>
            <button onClick={() => setScreen({ type: 'home' })} style={{ ...topBtn, textAlign: 'left', padding: '10px 8px' }}>‹ Back</button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
              {(['chats', 'board'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setScreen({ type: 'projects', sub: tab })}
                  style={{
                    ...topBtn,
                    color: screen.sub === tab ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: screen.sub === tab ? 600 : 400,
                  }}
                >{tab === 'chats' ? 'Chats' : 'Board'}</button>
              ))}
            </div>
            <span />
          </div>
        )
      case 'chat': {
        const ch = CHANNELS.find(c => c.id === screen.channelId)
        return <CenteredHeader title={`${ch?.prefix ?? ''}${ch?.name ?? ''}`} onBack={() => setScreen({ type: 'projects', sub: 'chats' })} />
      }
      case 'agents':
        return <CenteredHeader title="Agents" onBack={() => setScreen({ type: 'home' })} />
      case 'agentDetail':
        return <CenteredHeader title="Agent" onBack={() => setScreen({ type: 'agents' })} />
      case 'cron':
      case 'calendar':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', alignItems: 'center', width: '100%', height: '100%' }}>
            <button onClick={() => setScreen({ type: 'home' })} style={{ ...topBtn, textAlign: 'left', padding: '10px 8px' }}>‹ Back</button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
              {([
                { key: 'cron', label: 'Scheduled' },
                { key: 'calendar', label: 'Calendar' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setScreen({ type: tab.key })}
                  style={{
                    ...topBtn,
                    color: screen.type === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: screen.type === tab.key ? 600 : 400,
                  }}
                >{tab.label}</button>
              ))}
            </div>
            <span />
          </div>
        )
      case 'cronDetail':
        return <CenteredHeader title="Scheduled Job" onBack={() => setScreen({ type: 'cron' })} />
      case 'settings':
        return <CenteredHeader title="Settings" onBack={() => setScreen({ type: 'home' })} />
      case 'workflows':
        return <CenteredHeader title="Squads" onBack={() => setScreen({ type: 'home' })} />
      case 'squadSettings':
        return <CenteredHeader title={screen.workflowId ? 'Squad Settings' : 'New Squad'} onBack={() => setScreen({ type: 'workflows' })} />
      case 'memory':
      case 'timeline':
      case 'observability':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', alignItems: 'center', width: '100%', height: '100%' }}>
            <button onClick={() => setScreen({ type: 'home' })} style={{ ...topBtn, textAlign: 'left', padding: '10px 8px' }}>‹ Back</button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 0 }}>
              {([
                { key: 'timeline' as const, label: 'Reports' },
                { key: 'memory' as const, label: 'Memory' },
                { key: 'observability' as const, label: 'Observability' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setScreen({ type: tab.key })}
                  style={{
                    ...topBtn,
                    color: screen.type === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: screen.type === tab.key ? 600 : 400,
                  }}
                >{tab.label}</button>
              ))}
            </div>
            <span />
          </div>
        )
      case 'skillGraph':
        return <CenteredHeader title="Skill Graph" onBack={() => setScreen({ type: 'home' })} />
      case 'gateway':
        return <CenteredHeader title="Gateway" onBack={() => setScreen({ type: 'home' })} />
      case 'kpis':
        return <CenteredHeader title="Usage & KPIs" onBack={() => setScreen({ type: 'home' })} />
      case 'killswitch':
        return <CenteredHeader title="Kill Switch" onBack={() => setScreen({ type: 'home' })} titleColor="#ef4444" />
    }
  }

  const screenKey =
    screen.type === 'chat' ? `chat-${screen.channelId}` :
    screen.type === 'projects' ? `projects-${screen.sub}` :
    screen.type === 'agentDetail' ? `agent-${screen.agentId}` :
    screen.type === 'cronDetail' ? `cron-${screen.jobId}` :
    screen.type

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', position: 'relative' }}>
      <div className="grain-overlay" aria-hidden="true" />
      <header
        className="sticky top-0 z-50 flex items-center justify-between"
        style={{ padding: '0 4px', height: 44, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--separator)' }}
      >
        {headerContent()}
      </header>
      <div className="flex-1 overflow-y-auto" style={{ position: 'relative', zIndex: 1 }}>
        <AnimatePresence mode="wait">
          <motion.div key={screenKey} {...pageTransition} style={{ minHeight: '100%' }}>
            {screen.type === 'home' && <HomePage onNavigate={setScreen} />}
            {screen.type === 'projects' && screen.sub === 'chats' && (
              <ChannelList channels={CHANNELS} onSelect={id => setScreen({ type: 'chat', channelId: id })} />
            )}
            {screen.type === 'projects' && screen.sub === 'board' && <KanbanView columns={kanbanCols} setColumns={setKanbanCols} />}
            {screen.type === 'chat' && <ChatView channelId={screen.channelId} />}
            {screen.type === 'agents' && <AgentsPage onSelect={id => setScreen({ type: 'agentDetail', agentId: id })} />}
            {screen.type === 'agentDetail' && <AgentDetailPage agentId={screen.agentId} />}
            {screen.type === 'cron' && <CronPage onSelect={id => setScreen({ type: 'cronDetail', jobId: id })} />}
            {screen.type === 'calendar' && <CalendarPage />}
            {screen.type === 'cronDetail' && <CronDetailPage jobId={screen.jobId} />}
            {screen.type === 'workflows' && <WorkflowsPage onEdit={(id) => setScreen({ type: 'squadSettings', workflowId: id })} onCreate={() => setScreen({ type: 'squadSettings' })} />}
            {screen.type === 'squadSettings' && <SquadSettingsPage workflowId={screen.workflowId} onSaved={() => setScreen({ type: 'workflows' })} />}
            {screen.type === 'memory' && <MemoryPage />}
            {screen.type === 'timeline' && <TimelinePage onNavigate={setScreen} />}
            {screen.type === 'observability' && <ObservabilityPage />}
            {screen.type === 'skillGraph' && <SkillGraphPage />}
            {screen.type === 'gateway' && <GatewayPage />}
            {screen.type === 'settings' && <SettingsPage />}
            {screen.type === 'kpis' && <KPIsPage />}
            {screen.type === 'killswitch' && <KillPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Home ───────────────────────────────────────────────
function HomePage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { user: authUser } = useAuth()
  const [gateway, setGateway] = useState<GatewayStatus | null>(null)
  const [cronStats, setCronStats] = useState<{ active: number; total: number } | null>(null)
  const [agentSummary, setAgentSummary] = useState<AgentSummary | null>(null)
  const [projectUnread, setProjectUnread] = useState<number>(0)
  const [refreshing, setRefreshing] = useState(false)
  const [latestReport, setLatestReport] = useState<{id:string, source:string, title:string, text:string, timestamp:string}|null>(null)
  const [reportExpanded, setReportExpanded] = useState(false)

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const [gwRes, cronRes, agentRes, topicsRes, reportsRes] = await Promise.allSettled([
        fetch('/api/gateway-status').then(r => r.json()),
        fetch('/api/cron-jobs').then(r => r.json()),
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/topics').then(r => r.json()),
        fetch('/api/reports/latest').then(r => r.json()),
      ])

      if (gwRes.status === 'fulfilled') setGateway(gwRes.value)
      else setGateway({ status: 'offline', port: 0, uptime: null })

      if (cronRes.status === 'fulfilled') {
        const jobs = cronRes.value?.jobs ?? []
        setCronStats({ active: jobs.filter((j: CronJob) => j.status === 'active').length, total: jobs.length })
      }

      if (agentRes.status === 'fulfilled') {
        setAgentSummary(agentRes.value?.summary ?? null)
      }

      if (topicsRes.status === 'fulfilled') {
        const topics = topicsRes.value?.topics ?? []
        const readCounts = loadReadCounts()

        // First-time bootstrap: baseline to current counts (avoid huge historical unread wall).
        if (Object.keys(readCounts).length === 0 && topics.length > 0) {
          for (const t of topics) readCounts[t.channel] = Number(t.messageCount || 0)
          if (typeof window !== 'undefined') localStorage.setItem(READ_COUNTS_KEY, JSON.stringify(readCounts))
        }

        const unread = topics.reduce((sum: number, t: any) => {
          const ch = CHANNELS.find(c => c.id === t.channel)
          if (!ch || ch.prefix !== 'p/') return sum
          const total = Number(t.messageCount || 0)
          const seen = Number(readCounts[t.channel] || 0)
          return sum + Math.max(0, total - seen)
        }, 0)
        setProjectUnread(unread)
      }

      if (reportsRes.status === 'fulfilled') {
        const reports = reportsRes.value
        if (Array.isArray(reports) && reports.length > 0) {
          setLatestReport(reports[0])
        }
      }
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 15000)
    const onRead = () => fetchAll()
    window.addEventListener('clawpanel-read-updated', onRead as EventListener)
    return () => {
      clearInterval(iv)
      window.removeEventListener('clawpanel-read-updated', onRead as EventListener)
    }
  }, [fetchAll])

  const isOnline = gateway?.status === 'online'

  const statusCards: Array<{
    icon: React.ReactNode; label: string; value: string; color: string; dot: 'green' | 'yellow' | 'red'
    onClick?: () => void
  }> = [
    {
      icon: isOnline ? <Wifi size={15} /> : <WifiOff size={15} />,
      label: 'Gateway',
      value: gateway === null ? '…' : isOnline ? 'Online' : 'Offline',
      color: gateway === null ? 'var(--text-tertiary)' : isOnline ? 'var(--accent)' : '#ef4444',
      dot: gateway === null ? 'yellow' : isOnline ? 'green' : 'red',
      onClick: () => onNavigate({ type: 'gateway' }),
    },
    {
      icon: <Bot size={15} />,
      label: 'Agents',
      value: agentSummary
        ? `${agentSummary.active} active / ${agentSummary.queued} queued / ${agentSummary.total}`
        : '…',
      color: 'var(--text-secondary)',
      dot: agentSummary && agentSummary.active > 0 ? 'green' : 'yellow',
      onClick: () => onNavigate({ type: 'agents' }),
    },
    {
      icon: <Clock size={15} />,
      label: 'Scheduled',
      value: cronStats ? `${cronStats.active} active / ${cronStats.total}` : '…',
      color: 'var(--text-secondary)',
      dot: cronStats && cronStats.active > 0 ? 'green' : 'yellow',
      onClick: () => onNavigate({ type: 'cron' }),
    },
    {
      icon: <Activity size={15} />,
      label: 'Uptime',
      value: gateway?.uptime ? formatUptime(gateway.uptime) : isOnline ? 'Running' : '—',
      color: 'var(--text-secondary)',
      dot: isOnline ? 'green' : 'red',
      onClick: () => onNavigate({ type: 'kpis' }),
    },
  ]

  const navItems = [
    { label: 'Projects',    icon: <MessageSquare size={15} />, badge: projectUnread || null, screen: { type: 'projects', sub: 'chats' } as Screen },
    { label: 'Calendar',    icon: <CalendarDays size={15} />,  badge: null, screen: { type: 'calendar' } as Screen },
    { label: 'Board',       icon: <Grid3X3 size={15} />,       badge: null, screen: { type: 'projects', sub: 'board' } as Screen },
    { label: 'Squads',      icon: <GitBranch size={15} />,     badge: null, screen: { type: 'workflows' } as Screen },
    { label: 'Memory',      icon: <Book size={15} />,          badge: null, screen: { type: 'memory' } as Screen },
    { label: 'Observability', icon: <Activity size={15} />,    badge: null, screen: { type: 'observability' } as Screen },
    { label: 'Skill Graph', icon: <FileText size={15} />,      badge: null, screen: { type: 'skillGraph' } as Screen },
  ]

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
        style={{ padding: '18px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className="flex items-center gap-1.5" style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk), sans-serif', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>
            ClawPanel
          </h1>
          <span style={{
            fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#93c5fd', background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(96,165,250,0.28)',
            borderRadius: 999, padding: '2px 7px',
          }}>v0.3</span>
          {isOnline && (
            <div className="flex items-center gap-1">
              <div style={{ position: 'relative', width: 7, height: 7 }}>
                <div className="live-dot-ring" />
                <div className="live-dot" />
              </div>
              <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live</span>
            </div>
          )}
          {authUser.isAuthenticated && (
            <span style={{ fontSize: '0.6rem', color: '#10b981', marginLeft: 8 }}>
              {authUser.email}
            </span>
          )}
        </div>
        <button onClick={fetchAll} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 6, borderRadius: 6 }}>
          <RefreshCw size={13} style={{ transition: 'transform 0.4s', transform: refreshing ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
      </motion.div>

      {/* 2×2 status grid */}
      <div style={{ padding: '0 10px', marginBottom: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {statusCards.map((card, i) => (
            <motion.div key={card.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <div
                role={card.onClick ? 'button' : undefined}
                tabIndex={card.onClick ? 0 : undefined}
                onClick={card.onClick}
                onKeyDown={card.onClick ? (e => e.key === 'Enter' && card.onClick?.()) : undefined}
                className={`glass-card${card.onClick ? ' clickable' : ''}`}
                style={{ padding: '10px 12px', cursor: card.onClick ? 'pointer' : 'default' }}
              >
                <div className="flex items-center gap-1.5" style={{ marginBottom: 6, color: 'var(--text-tertiary)' }}>
                  {card.icon}
                  <span style={{ fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{card.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`status-dot ${card.dot}`} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: card.color, fontFamily: 'var(--font-space-grotesk)' }}>{card.value}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Latest Intel Report Card */}
      {latestReport && (
        <div style={{ padding: '0 10px', marginTop: 10, marginBottom: 6 }}>
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <div
              className="glass-card clickable"
              style={{ padding: '12px 14px', cursor: 'pointer', borderLeft: `3px solid ${getReportSourceColor(latestReport.source)}` }}
              onClick={() => setReportExpanded(!reportExpanded)}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: getReportSourceColor(latestReport.source) }}>
                  {latestReport.source}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>
                  {formatReportTimestamp(latestReport.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {reportExpanded ? (
                  <div>{renderSimpleMarkdown(latestReport.text)}</div>
                ) : (
                  <div style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    display: '-webkit-box', 
                    WebkitLineClamp: 2, 
                    WebkitBoxOrient: 'vertical' 
                  }}>
                    {latestReport.text}
                  </div>
                )}
              </div>
              {reportExpanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onNavigate({ type: 'timeline' }) }}
                    style={{
                      background: 'rgba(var(--accent-rgb), 0.1)',
                      border: '1px solid rgba(var(--accent-rgb), 0.2)',
                      color: 'var(--accent)',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View All Reports →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Navigate */}
      <div className="section-header" style={{ marginTop: 8 }}>Navigate</div>
      <div style={{ margin: '0 8px' }}>
        {navItems.map((item, i) => (
          <motion.div key={item.label} custom={i + 4} variants={fadeUp} initial="hidden" animate="visible">
            <div
              role="button" tabIndex={0}
              onClick={() => onNavigate(item.screen)}
              onKeyDown={e => e.key === 'Enter' && onNavigate(item.screen)}
              className="glass-card clickable"
              style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', marginBottom: 5 }}
            >
              <span style={{ color: 'var(--accent)', marginRight: 11, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</span>
              {item.badge !== null && <span className="flat-item-badge">{item.badge}</span>}
              <ChevronRight size={13} style={{ color: 'var(--text-tertiary)', marginLeft: 6 }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* System */}
      <div className="section-header" style={{ marginTop: 8 }}>System</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={9} variants={fadeUp} initial="hidden" animate="visible">
          <div
            role="button" tabIndex={0}
            onClick={() => onNavigate({ type: 'settings' })}
            onKeyDown={e => e.key === 'Enter' && onNavigate({ type: 'settings' })}
            className="glass-card clickable"
            style={{ padding: '12px 14px', marginBottom: 5, display: 'flex', alignItems: 'center' }}
          >
            <span style={{ display: 'flex', marginRight: 11 }}><Settings size={15} style={{ color: 'var(--accent)' }} /></span>
            <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>Settings</span>
            <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
          </div>
        </motion.div>
        <motion.div custom={10} variants={fadeUp} initial="hidden" animate="visible">
          <div
            role="button" tabIndex={0}
            onClick={() => onNavigate({ type: 'killswitch' })}
            onKeyDown={e => e.key === 'Enter' && onNavigate({ type: 'killswitch' })}
            className="glass-card clickable"
            style={{ padding: '12px 14px', marginBottom: 5, display: 'flex', alignItems: 'center', background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' }}
          >
            <span style={{ display: 'flex', marginRight: 11 }}><Power size={15} style={{ color: '#ef4444' }} /></span>
            <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, color: '#ef4444' }}>Kill Switch</span>
            <ChevronRight size={13} style={{ color: '#ef4444', opacity: 0.6 }} />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function getReportSourceColor(source: string): string {
  if (source.toLowerCase().includes('morning')) return '#fbbf24'
  if (source.toLowerCase().includes('afternoon')) return '#fb923c'
  if (source.toLowerCase().includes('brief')) return '#60a5fa'
  if (source.toLowerCase().includes('research')) return '#a78bfa'
  if (source.toLowerCase().includes('cron')) return '#34d399'
  return 'var(--accent)'
}

function formatReportTimestamp(timestamp: string): string {
  const now = new Date()
  const ts = new Date(timestamp)
  const diff = now.getTime() - ts.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return ts.toLocaleDateString()
}

function renderSimpleMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    
    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 12, marginBottom: 6 }}>{line.slice(4)}</h3>)
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: '1rem', fontWeight: 700, marginTop: 14, marginBottom: 8 }}>{line.slice(3)}</h2>)
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 16, marginBottom: 10 }}>{line.slice(2)}</h1>)
      continue
    }
    
    // Bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginLeft: 8, marginBottom: 4 }}>
          <span style={{ color: 'var(--accent)' }}>•</span>
          <span>{processInlineMarkdown(line.trim().slice(2))}</span>
        </div>
      )
      continue
    }
    
    // Regular line with inline markdown
    if (line.trim()) {
      elements.push(<div key={i} style={{ marginBottom: 6 }}>{processInlineMarkdown(line)}</div>)
    } else {
      elements.push(<div key={i} style={{ height: 6 }} />)
    }
  }
  
  return <div>{elements}</div>
}

function processInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let current = ''
  let i = 0
  
  while (i < text.length) {
    // Bold **text**
    if (text.substr(i, 2) === '**') {
      if (current) {
        parts.push(current)
        current = ''
      }
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        parts.push(<strong key={i} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{text.substring(i + 2, end)}</strong>)
        i = end + 2
        continue
      }
    }
    
    // Inline code `text`
    if (text[i] === '`') {
      if (current) {
        parts.push(current)
        current = ''
      }
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        parts.push(
          <code key={i} style={{ 
            background: 'rgba(255,255,255,0.08)', 
            padding: '2px 6px', 
            borderRadius: 4, 
            fontSize: '0.85em',
            fontFamily: 'monospace'
          }}>
            {text.substring(i + 1, end)}
          </code>
        )
        i = end + 1
        continue
      }
    }
    
    current += text[i]
    i++
  }
  
  if (current) parts.push(current)
  return <>{parts}</>
}

// ─── Agents ─────────────────────────────────────────────
function AgentsPage({ onSelect }: { onSelect: (id: string) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [summary, setSummary] = useState<AgentSummary | null>(null)
  const [workflowRuntime, setWorkflowRuntime] = useState<Array<{
    id: string
    name: string
    status: 'running' | 'failed' | 'completed' | 'idle'
    activeRuns: number
    runningSteps: number
    queuedSteps: number
    failedRuns: number
    completedRuns: number
    lastRunAt: string | null
    lastTask: string | null
    lastFailedStep: string | null
    lastError: string | null
  }>>([])
  const [sort, setSort] = useState<SortKey>('group')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        if (data.agents?.length) setAgents(data.agents)
        setSummary(data.summary ?? null)
        // Use workflowHealth from agents API (includes error context)
        const rows = (data.workflowHealth ?? []).map((wf: any) => ({
          id: wf.id,
          name: wf.id.split('-').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
          status: wf.status ?? 'idle',
          activeRuns: wf.activeRuns ?? 0,
          runningSteps: wf.runningSteps ?? 0,
          queuedSteps: wf.queuedSteps ?? 0,
          failedRuns: wf.failedRuns ?? 0,
          completedRuns: wf.completedRuns ?? 0,
          lastRunAt: wf.lastRunAt ?? null,
          lastTask: wf.lastTask ?? null,
          lastFailedStep: wf.lastFailedStep ?? null,
          lastError: wf.lastError ?? null,
        }))
        setWorkflowRuntime(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const cycleSorts: SortKey[] = ['group', 'name', 'status', 'model']
  const nextSort = () => {
    const idx = cycleSorts.indexOf(sort)
    setSort(cycleSorts[(idx + 1) % cycleSorts.length])
  }

  const statusRank: Record<'active' | 'queued' | 'idle' | 'stale', number> = {
    active: 0,
    queued: 1,
    idle: 2,
    stale: 3,
  }

  const sorted = [...agents].sort((a, b) => {
    const aStatus = a.activity || (a.hasSessions ? 'active' : 'idle')
    const bStatus = b.activity || (b.hasSessions ? 'active' : 'idle')

    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'status':
        return statusRank[aStatus] - statusRank[bStatus]
      case 'model':
        return a.model.localeCompare(b.model)
      case 'group':
      default:
        if (a.group === 'core' && b.group !== 'core') return -1
        if (a.group !== 'core' && b.group === 'core') return 1
        if (a.group !== b.group) return a.group.localeCompare(b.group)
        return a.name.localeCompare(b.name)
    }
  })

  const groups: Array<{ group: string; agents: AgentInfo[] }> = []
  if (sort === 'group') {
    const map = new Map<string, AgentInfo[]>()
    for (const a of sorted) {
      if (!map.has(a.group)) map.set(a.group, [])
      map.get(a.group)!.push(a)
    }
    Array.from(map.entries()).forEach(([group, list]) => groups.push({ group, agents: list }))
  } else {
    groups.push({ group: '', agents: sorted })
  }

  if (loading) {
    return <LobsterLoader label="Loading agents…" />
  }

  const workflowRank = { failed: 0, running: 1, idle: 2, completed: 3 }
  const rankedWorkflows = [...workflowRuntime].sort((a, b) => {
    if (workflowRank[a.status] !== workflowRank[b.status]) return workflowRank[a.status] - workflowRank[b.status]
    return a.name.localeCompare(b.name)
  })

  let idx = 0

  return (
    <div style={{ paddingBottom: 24 }}>
      {summary && (
        <div style={{ margin: '0 8px 8px' }}>
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Active', value: summary.active, color: '#10b981' },
                  { label: 'Queued', value: summary.queued, color: '#60a5fa' },
                  { label: 'Total', value: summary.total, color: 'var(--text-primary)' },
                ].map((m) => (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: m.color, fontFamily: 'var(--font-space-grotesk)' }}>{m.value}</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>Squad runs: <span style={{ color: '#10b981' }}>{summary.activeRuns} active</span></div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>Squad steps: <span style={{ color: '#60a5fa' }}>{summary.runningSteps} running</span> / <span style={{ color: '#93c5fd' }}>{summary.queuedSteps} queued</span></div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>Scheduled jobs: <span style={{ color: '#93c5fd' }}>{summary.scheduled ?? 0}</span></div>
                {summary.failedWorkflows > 0 && <div style={{ fontSize: '0.62rem', color: '#ef4444' }}>{summary.failedWorkflows} failed squad{summary.failedWorkflows > 1 ? 's' : ''}</div>}
              </div>

              <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                {summary.active > 0 && <div style={{ width: `${(summary.active / Math.max(1, summary.total)) * 100}%`, background: '#10b981' }} />}
                {summary.queued > 0 && <div style={{ width: `${(summary.queued / Math.max(1, summary.total)) * 100}%`, background: '#60a5fa' }} />}
                {summary.idle > 0 && <div style={{ width: `${(summary.idle / Math.max(1, summary.total)) * 100}%`, background: '#6b7280' }} />}
                {summary.stale > 0 && <div style={{ width: `${(summary.stale / Math.max(1, summary.total)) * 100}%`, background: '#f59e0b' }} />}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {rankedWorkflows.length > 0 && (
        <>
          <div className="section-header">Squad Runtime</div>
          <div style={{ margin: '0 8px 8px' }}>
            {rankedWorkflows.map((wf, i) => {
              const color = wf.status === 'failed' ? '#ef4444' : wf.status === 'running' ? '#10b981' : wf.status === 'completed' ? '#60a5fa' : 'var(--text-tertiary)'
              const label = wf.status === 'failed' ? 'Failed' : wf.status === 'running' ? 'Running' : wf.status === 'completed' ? 'Completed' : 'Idle'
              return (
                <motion.div key={wf.id} custom={i + 1} variants={fadeUp} initial="hidden" animate="visible">
                  <div className="glass-card" style={{ padding: '9px 12px', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.name}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {wf.runningSteps} running · {wf.queuedSteps} queued · {wf.failedRuns} failed · {wf.completedRuns} completed{wf.lastRunAt ? ` · last ${relativeTime(wf.lastRunAt)}` : ''}
                        </div>
                        {wf.status === 'failed' && (wf.lastFailedStep || wf.lastError) && (
                          <div style={{ fontSize: '0.58rem', color: '#fca5a5', marginTop: 3, lineHeight: 1.35 }}>
                            {wf.lastFailedStep ? `Failed at ${wf.lastFailedStep}` : 'Failed'}{wf.lastError ? ` — ${wf.lastError}` : ''}
                          </div>
                        )}
                        {wf.status === 'completed' && wf.lastTask && (
                          <div style={{ fontSize: '0.58rem', color: '#93c5fd', marginTop: 3, lineHeight: 1.35 }}>
                            Last completed: {wf.lastTask.slice(0, 120)}{wf.lastTask.length > 120 ? '…' : ''}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                        background: `${color}1a`, color,
                        border: `1px solid ${color}33`,
                        flexShrink: 0,
                      }}>{label}</span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={nextSort}
          style={{
            ...topBtn, fontSize: '0.72rem', padding: '6px 10px',
            display: 'flex', alignItems: 'center', gap: 4,
            color: 'var(--text-secondary)', background: 'var(--bg-tertiary)',
            borderRadius: 8, border: '1px solid var(--separator)',
          }}
        >
          <ArrowUpDown size={11} />
          Sort: {sort}
        </button>
      </div>

      {groups.map(({ group, agents: groupAgents }) => (
        <div key={group || 'all'}>
          {group && <div className="section-header">{group}</div>}
          <div style={{ margin: '0 8px' }}>
            {groupAgents.map(agent => {
              const i = idx++
              const status = agent.activity || (agent.hasSessions ? 'active' : 'idle')
              const statusCfg = status === 'active'
                ? { color: '#10b981', label: 'Running' }
                : status === 'queued'
                  ? { color: '#60a5fa', label: 'Queued' }
                  : status === 'stale'
                    ? { color: '#f59e0b', label: 'Stale' }
                    : { color: '#6b7280', label: 'Idle' }

              const statusHint = agent.runningSteps
                ? `${agent.runningSteps} active step${agent.runningSteps > 1 ? 's' : ''}`
                : agent.queuedSteps
                  ? `${agent.queuedSteps} queued step${agent.queuedSteps > 1 ? 's' : ''}`
                  : agent.scheduledJobs
                    ? `${agent.scheduledJobs} scheduled cron job${agent.scheduledJobs > 1 ? 's' : ''}`
                    : agent.lastActiveAt
                      ? `Last active ${relativeTime(agent.lastActiveAt)}`
                      : 'No recent activity'

              return (
                <motion.div key={agent.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                  <div
                    role="button" tabIndex={0}
                    onClick={() => onSelect(agent.id)}
                    onKeyDown={e => e.key === 'Enter' && onSelect(agent.id)}
                    className="glass-card clickable"
                    style={{ padding: '10px 13px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Bot size={14} style={{ color: statusCfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 2 }}>{agent.name}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                        {shortModel(agent.model)}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {statusHint}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: statusCfg.color }} />
                      <span style={{ fontSize: '0.68rem', color: statusCfg.color, fontWeight: 500 }}>{statusCfg.label}</span>
                    </div>
                    <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Agent Detail ───────────────────────────────────────
type SessionSummary = { id: string; agentId: string; file: string; sizeKB: number; created: string; messageCount: number; preview: string }
type SessionMsg = { id: string; role: string; text: string; timestamp: string; model?: string }

function AgentDetailPage({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentInfo | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; alias?: string }>>([])
  const [editingModel, setEditingModel] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sessionMsgs, setSessionMsgs] = useState<SessionMsg[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(data => {
      const found = data.agents?.find((a: AgentInfo) => a.id === agentId)
      if (found) { setAgent(found); setSelectedModel(found.model) }
    }).catch(() => {})
    fetch('/api/agent-config').then(r => r.json()).then(data => {
      if (data.models) setAvailableModels(data.models)
    }).catch(() => {})
    fetch(`/api/sessions?agent=${encodeURIComponent(agentId)}`).then(r => r.json()).then(data => {
      if (data.sessions) setSessions(data.sessions)
    }).catch(() => {})
  }, [agentId])

  const loadSession = (sessionId: string) => {
    if (expandedSession === sessionId) { setExpandedSession(null); return }
    setExpandedSession(sessionId)
    setLoadingMsgs(true)
    fetch(`/api/sessions?agent=${encodeURIComponent(agentId)}&session=${encodeURIComponent(sessionId)}&limit=30`)
      .then(r => r.json())
      .then(data => { if (data.messages) setSessionMsgs(data.messages) })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false))
  }

  const saveModel = async () => {
    if (!selectedModel) return
    setSaving(true)
    try {
      await fetch('/api/agent-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model: selectedModel }),
      })
      setAgent(prev => prev ? { ...prev, model: selectedModel } : prev)
      setEditingModel(false)
    } catch {}
    setSaving(false)
  }

  if (!agent) return <LobsterLoader label="Loading agent…" />

  const status = agent.activity || (agent.hasSessions ? 'active' : 'idle')
  const statusCfg = status === 'active'
    ? { color: '#10b981', label: 'Running', dot: 'green' as const }
    : status === 'queued'
      ? { color: '#60a5fa', label: 'Queued', dot: 'yellow' as const }
      : status === 'stale'
        ? { color: '#f59e0b', label: 'Stale', dot: 'yellow' as const }
        : { color: '#6b7280', label: 'Idle', dot: 'yellow' as const }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}>
        <div style={{ padding: '18px 14px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={22} style={{ color: statusCfg.color }} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '1.15rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{agent.name}</h2>
            <div className="flex items-center gap-1.5" style={{ marginTop: 4 }}>
              <span className={`status-dot ${statusCfg.dot}`} />
              <span style={{ fontSize: '0.72rem', color: statusCfg.color, fontWeight: 500 }}>{statusCfg.label}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Model — editable */}
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Terminal size={14} /></span>
        Model
      </div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 6 }}>
            {!editingModel ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.76rem', fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {agent.model === 'default' ? 'Default (global config)' : agent.model}
                </span>
                <button onClick={() => setEditingModel(true)} style={{
                  fontSize: '0.66rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--accent)',
                  cursor: 'pointer', flexShrink: 0, marginLeft: 8,
                }}>Edit</button>
              </div>
            ) : (
              <div>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: '0.74rem',
                    background: 'var(--bg-primary)', border: '1px solid var(--separator-strong)',
                    color: 'var(--text-primary)', outline: 'none', marginBottom: 8,
                  }}
                >
                  <option value="default">Default (global config)</option>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.alias ? `${m.alias} — ${m.id}` : m.id}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveModel} disabled={saving} style={{
                    fontSize: '0.66rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
                  }}>{saving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => { setEditingModel(false); setSelectedModel(agent.model) }} style={{
                    fontSize: '0.66rem', padding: '5px 12px', borderRadius: 6,
                    background: 'var(--bg-tertiary)', border: '1px solid var(--separator)', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Info */}
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Folder size={14} /></span>
        Identity
      </div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '2px 0', marginBottom: 6 }}>
            {[
              { key: 'Group', value: agent.group },
              { key: 'ID', value: agent.id },
              { key: 'Dir', value: `~/.openclaw/agents/${agent.id}/` },
            ].map((row, ri, arr) => (
              <div key={row.key} style={{
                padding: '9px 14px', display: 'flex', justifyContent: 'space-between', gap: 12,
                borderBottom: ri < arr.length - 1 ? '1px solid var(--separator)' : 'none',
              }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{row.key}</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Sessions */}
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><MessageSquare size={14} /></span>
        Sessions ({sessions.length})
      </div>
      <div style={{ margin: '0 8px' }}>
        {sessions.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>No sessions</div>
        )}
        {sessions.map((sess, i) => {
          const isExpanded = expandedSession === sess.id
          return (
            <motion.div key={sess.id} custom={i + 2} variants={fadeUp} initial="hidden" animate="visible">
              <div
                role="button" tabIndex={0}
                onClick={() => loadSession(sess.id)}
                onKeyDown={e => e.key === 'Enter' && loadSession(sess.id)}
                className="glass-card clickable"
                style={{ padding: '10px 12px', marginBottom: 5, transition: 'border-color 0.15s', borderColor: isExpanded ? 'rgba(255,255,255,0.15)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sess.id.slice(0, 20)}…
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {new Date(sess.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {sess.sizeKB}KB · ~{sess.messageCount} msgs
                    </div>
                  </div>
                  <ChevronDown size={12} style={{
                    color: 'var(--text-tertiary)', flexShrink: 0,
                    transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  }} />
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <div style={{ marginTop: 10, maxHeight: 350, overflowY: 'auto', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--separator)', padding: '8px 10px' }}>
                        {loadingMsgs && <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)', padding: 8 }}>Loading…</div>}
                        {!loadingMsgs && sessionMsgs.map(msg => (
                          <div key={msg.id} style={{ marginBottom: 8, padding: '6px 0', borderBottom: '1px solid var(--separator)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{
                                fontSize: '0.58rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                                background: msg.role === 'user' ? 'rgba(16,185,129,0.12)' : msg.role === 'assistant' ? 'rgba(59,130,246,0.12)' : 'var(--bg-tertiary)',
                                color: msg.role === 'user' ? '#10b981' : msg.role === 'assistant' ? '#60a5fa' : 'var(--text-tertiary)',
                              }}>{msg.role}</span>
                              <span style={{ fontSize: '0.56rem', color: 'var(--text-tertiary)' }}>
                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <div style={{
                              fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.45,
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text',
                              WebkitUserSelect: 'text',
                            }}>
                              {msg.text.slice(0, 500)}{msg.text.length > 500 ? '…' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Cron ───────────────────────────────────────────────
function CronPage({ onSelect }: { onSelect: (id: string) => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cron-jobs')
      .then(r => r.json())
      .then(data => { if (data.jobs?.length) setJobs(data.jobs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <LobsterLoader label="Loading scheduled jobs…" />
  }

  const grouped = {
    active:   jobs.filter(j => j.status === 'active'),
    error:    jobs.filter(j => j.status === 'error'),
    disabled: jobs.filter(j => j.status === 'disabled'),
  }

  const dotMap = { active: 'green' as const, error: 'red' as const, disabled: 'yellow' as const }
  const colorMap = { active: '#10b981', error: '#ef4444', disabled: '#6b7280' }
  let idx = 0

  return (
    <div style={{ paddingBottom: 24 }}>
      {(['active', 'error', 'disabled'] as const).map(status => {
        const items = grouped[status]
        if (!items.length) return null
        return (
          <div key={status}>
            <div className="section-header">{status === 'active' ? 'Active' : status === 'error' ? 'Error' : 'Disabled'} ({items.length})</div>
            <div style={{ margin: '0 8px' }}>
              {items.map(job => {
                const i = idx++
                return (
                  <motion.div key={job.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                    <div
                      role="button" tabIndex={0}
                      onClick={() => onSelect(job.id)}
                      onKeyDown={e => e.key === 'Enter' && onSelect(job.id)}
                      className="glass-card clickable"
                      style={{ padding: '10px 13px', marginBottom: 5 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`status-dot ${dotMap[status]}`} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1 }}>{job.name}</span>
                        {job.consecutiveErrors > 0 && (
                          <span style={{ fontSize: '0.62rem', color: '#ef4444', fontWeight: 600 }}>
                            {job.consecutiveErrors} err{job.consecutiveErrors > 1 ? 's' : ''}
                          </span>
                        )}
                        <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14 }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{job.schedule}</span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: 4, padding: '1px 5px' }}>
                          {shortModel(job.model)}
                        </span>
                      </div>
                      {(job.nextRun || job.lastRun) && (
                        <div style={{ display: 'flex', gap: 12, paddingLeft: 14, marginTop: 4 }}>
                          {job.nextRun && (
                            <span style={{ fontSize: '0.62rem', color: colorMap[status] }}>Next: {relativeTime(job.nextRun)}</span>
                          )}
                          {job.lastRun && (
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Last: {relativeTime(job.lastRun)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Calendar (7-day view) ─────────────────────────────
type CalendarEvent = { jobId: string; name: string; at: string; isService: boolean; scheduleExpr: string; model: string }

function dateKeyPT(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

function dayLabelPT(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

function timeLabelPT(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
  }) + ' PT'
}

function isWeekendPT(d: Date): boolean {
  const wk = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })
  return wk === 'Sat' || wk === 'Sun'
}

function holidayNamePT(d: Date): string | null {
  const month = Number(d.toLocaleDateString('en-US', { month: 'numeric', timeZone: 'America/Los_Angeles' }))
  const day = Number(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }))
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })

  if (month === 1 && day === 1) return "New Year's Day"
  if (month === 6 && day === 19) return 'Juneteenth'
  if (month === 7 && day === 4) return 'Independence Day'
  if (month === 11 && day === 11) return 'Veterans Day'
  if (month === 12 && day === 25) return 'Christmas Day'

  // Thanksgiving (4th Thu of Nov) lightweight check
  if (month === 11 && weekday === 'Thu') {
    const dom = Number(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/Los_Angeles' }))
    if (dom >= 22 && dom <= 28) return 'Thanksgiving'
  }

  return null
}

function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(data => setEvents(data.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LobsterLoader label="Loading calendar…" />

  const now = new Date()
  const dayKeys = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
    return dateKeyPT(d)
  })

  const byDay = new Map<string, Array<CalendarEvent & { atDate: Date }>>()
  for (const k of dayKeys) byDay.set(k, [])
  for (const e of events) {
    const atDate = new Date(e.at)
    const k = dateKeyPT(atDate)
    if (byDay.has(k)) byDay.get(k)!.push({ ...e, atDate })
  }
  for (const k of dayKeys) byDay.get(k)!.sort((a, b) => a.atDate.getTime() - b.atDate.getTime())

  const todayKey = dayKeys[0]
  const todayItems = (byDay.get(todayKey) || []).reduce<Array<CalendarEvent & { atDate: Date }>>((acc, e) => {
    if (e.isService && acc.some(x => x.jobId === e.jobId)) return acc
    acc.push(e)
    return acc
  }, [])

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="section-header">Next Up Today</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
          {todayItems.length > 0 ? todayItems.map((e, i) => (
            <div key={`${e.jobId}-${i}`} style={{ padding: '6px 0', borderBottom: i < todayItems.length - 1 ? '1px solid var(--separator)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{e.name}</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>{timeLabelPT(e.atDate)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>{e.scheduleExpr}{e.isService ? ' · service' : ''}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{shortModel(e.model)}</div>
              </div>
            </div>
          )) : <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>No scheduled jobs today</div>}
        </div>
      </div>

      <div className="section-header">Next 7 Days (PT)</div>
      <div style={{ margin: '0 8px' }}>
        {dayKeys.map((k, i) => {
          const d = new Date((byDay.get(k)?.[0]?.atDate || new Date(now.getTime() + i * 24 * 60 * 60 * 1000)).getTime())
          const weekend = isWeekendPT(d)
          const holiday = holidayNamePT(d)
          const items = (byDay.get(k) || []).reduce<Array<CalendarEvent & { atDate: Date }>>((acc, e) => {
            if (e.isService && acc.some(x => x.jobId === e.jobId)) return acc
            acc.push(e)
            return acc
          }, [])

          return (
            <motion.div key={k} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <div className="glass-card" style={{
                padding: '10px 12px', marginBottom: 6,
                border: weekend ? '1px solid rgba(245,158,11,0.25)' : '1px solid var(--separator)',
                background: weekend ? 'rgba(245,158,11,0.06)' : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{dayLabelPT(d)}</span>
                    {weekend && <span style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: 600 }}>Weekend</span>}
                    {holiday && <span style={{ fontSize: '0.58rem', color: '#60a5fa', fontWeight: 600 }}>{holiday}</span>}
                  </div>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
                </div>

                {items.length === 0 ? (
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>No scheduled runs</div>
                ) : (
                  items.map((e, idx) => (
                    <div key={`${e.jobId}-${idx}`} style={{
                      padding: '7px 0',
                      borderBottom: idx < items.length - 1 ? '1px solid var(--separator)' : 'none',
                      display: 'flex', gap: 8,
                    }}>
                      <div style={{ width: 76, flexShrink: 0, fontSize: '0.64rem', color: 'var(--text-tertiary)' }}>{timeLabelPT(e.atDate)}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{e.scheduleExpr}{e.isService ? ' · service' : ''}</div>
                          <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{shortModel(e.model)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Gateway ────────────────────────────────────────────
function GatewayPage() {
  const [gateway, setGateway] = useState<GatewayStatus | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [agentCount, setAgentCount] = useState(0)
  const [cronCount, setCronCount] = useState(0)
  const [rebooting, setRebooting] = useState(false)
  const [rebootQueued, setRebootQueued] = useState(false)

  const triggerReboot = async () => {
    if (rebooting || rebootQueued) return
    setRebooting(true)
    try {
      const res = await fetch('/api/system/reboot', { method: 'POST' })
      if (res.ok) setRebootQueued(true)
    } catch {}
    setRebooting(false)
  }

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/gateway-status').then(r => r.json()),
      fetch('/api/system-stats').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/cron-jobs').then(r => r.json()),
    ]).then(([gw, st, ag, cr]) => {
      if (gw.status === 'fulfilled') setGateway(gw.value)
      if (st.status === 'fulfilled') setStats(st.value)
      if (ag.status === 'fulfilled') setAgentCount(ag.value?.agents?.length ?? 0)
      if (cr.status === 'fulfilled') setCronCount(cr.value?.jobs?.length ?? 0)
    })
  }, [])

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="section-header">Gateway</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Status</div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: gateway?.status === 'online' ? '#10b981' : '#ef4444' }}>{gateway?.status || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Port</div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700 }}>{gateway?.port ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Uptime</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{gateway?.uptime ? formatUptime(gateway.uptime) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Host</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats?.host?.hostname || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-header">Server</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
          <div style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>{stats?.host?.platform || '—'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ fontSize: '0.68rem' }}>CPU: <b>{stats?.cpu?.cores ?? '—'} cores</b></div>
            <div style={{ fontSize: '0.68rem' }}>Load(1m): <b>{stats?.cpu?.load1?.toFixed?.(2) ?? '—'}</b></div>
            <div style={{ fontSize: '0.68rem' }}>RAM used: <b>{stats?.memory?.usedMb ?? '—'} MB</b></div>
            <div style={{ fontSize: '0.68rem' }}>Disk /: <b>{stats?.disk?.rootUsedPercent ?? '—'}%</b></div>
          </div>
        </div>
      </div>

      <div className="section-header">OpenClaw</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
          <div style={{ marginBottom: 8, fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>
            Version: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{stats?.openclawVersion || '—'}</span>
          </div>
          <div style={{ marginBottom: 10, fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>
            System health: <span style={{ color: stats?.systemStatus?.health === 'ok' ? '#10b981' : stats?.systemStatus?.health === 'error' ? '#ef4444' : 'var(--text-primary)' }}>{stats?.systemStatus?.health || 'unknown'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{agentCount}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>Agents</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{cronCount}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>Scheduled Jobs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Force Reboot */}
      <div className="section-header" style={{ color: '#ef4444' }}>Emergency</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '14px 14px', marginBottom: 6, borderColor: 'rgba(239,68,68,0.25)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, color: '#ef4444' }}>Force Reboot Lightsail</div>
          <p style={{ margin: '0 0 10px', fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Reboots the full instance (not just agents). Use when panel/processes are wedged. Instance will be unavailable for 1–2 minutes.
          </p>
          <button
            onClick={triggerReboot}
            disabled={rebooting || rebootQueued}
            style={{
              width: '100%', padding: '10px', borderRadius: 9,
              background: rebootQueued ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${rebootQueued ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.3)'}`,
              color: rebootQueued ? '#10b981' : '#ef4444',
              fontSize: '0.76rem', fontWeight: 700, cursor: rebooting || rebootQueued ? 'default' : 'pointer',
              opacity: rebooting ? 0.7 : 1,
            }}
          >
            {rebootQueued ? 'Reboot queued — instance restarting…' : rebooting ? 'Queuing reboot…' : 'Force Reboot Instance'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kill Switch ────────────────────────────────────────
function KillPage() {
  const [armed, setArmed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div style={{ padding: '24px 12px' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}>
        <div className="danger-pulse" style={{
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 14, padding: '18px 16px', marginBottom: 12,
        }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: 10 }}>
            <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '0.95rem', fontWeight: 700, color: '#ef4444', letterSpacing: '-0.01em' }}>
              Emergency Stop
            </span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'rgba(239,68,68,0.8)', lineHeight: 1.5 }}>
            Instantly halts all agents, cron jobs, and active workflows. This action cannot be undone automatically.
          </p>
          {!confirmed ? (
            <button
              onClick={() => armed ? setConfirmed(true) : setArmed(true)}
              style={{
                width: '100%', padding: '11px',
                background: armed ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10,
                color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', fontFamily: 'var(--font-space-grotesk)',
              }}
            >
              <Power size={14} />
              {armed ? 'Tap again to confirm' : 'Arm Kill Switch'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: 10, color: '#ef4444', fontSize: '0.78rem' }}>
              ✓ All systems halted
            </div>
          )}
          {armed && !confirmed && (
            <button
              onClick={() => setConfirmed(true)}
              style={{
                width: '100%', marginTop: 6, padding: '11px',
                background: '#ef4444', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-space-grotesk)',
              }}
            >
              CONFIRM: STOP ALL SYSTEMS
            </button>
          )}
        </div>

        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
          Individual agent controls available in the Agents tab.
        </p>
      </motion.div>
    </div>
  )
}

// ─── Channel List ───────────────────────────────────────
function ChannelList({ channels, onSelect }: { channels: Channel[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [topicMeta, setTopicMeta] = useState<Record<string, { messageCount: number; lastMessage: string; lastTs: string }>>({})

  // Fetch real topic metadata on mount
  useEffect(() => {
    fetch('/api/topics')
      .then(r => r.json())
      .then(data => {
        if (data.topics) {
          const meta: Record<string, { messageCount: number; lastMessage: string; lastTs: string }> = {}
          for (const t of data.topics) {
            meta[t.channel] = { messageCount: t.messageCount, lastMessage: t.lastMessage, lastTs: t.lastTs }
          }
          setTopicMeta(meta)
        }
      })
      .catch(() => {})
  }, [])

  const filtered = channels.filter(ch => ch.name.toLowerCase().includes(query.toLowerCase()))

  // Group: projects (prefix p/) vs channels (c/ or none)
  const projects = filtered.filter(ch => ch.prefix === 'p/')
  const others = filtered.filter(ch => ch.prefix !== 'p/')

  const renderRow = (ch: Channel, i: number) => {
    const meta = topicMeta[ch.id]
    const lastMsg = meta?.lastMessage || ch.lastMsg
    const lastTime = meta?.lastTs ? new Date(meta.lastTs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
    const msgCount = meta?.messageCount || 0

    return (
      <motion.div key={ch.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
        <div
          role="button" tabIndex={0}
          onClick={() => onSelect(ch.id)}
          onKeyDown={e => e.key === 'Enter' && onSelect(ch.id)}
          className="glass-card clickable"
          style={{
            display: 'flex', alignItems: 'center', padding: '10px 12px',
            marginBottom: 4, gap: 10,
          }}
        >
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${ch.color}30, ${ch.color}12)`,
            border: `1px solid ${ch.color}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: ch.color,
          }}>
            {ch.icon}
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {ch.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                {msgCount > 0 && (
                  <span style={{ fontSize: '0.56rem', color: 'var(--text-tertiary)', opacity: 0.6 }}>
                    {msgCount} msgs
                  </span>
                )}
                {lastTime && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>
                    {lastTime}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: '0.72rem', color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {lastMsg}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Search */}
      <div style={{ padding: '8px 10px' }}>
        <div className="flex items-center" style={{
          background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
          borderRadius: 10, padding: '8px 12px', gap: 8,
        }}>
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', WebkitAppearance: 'none' }}
          />
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <>
          <div className="section-header">Projects</div>
          <div style={{ margin: '0 8px' }}>{projects.map((ch, i) => renderRow(ch, i))}</div>
        </>
      )}

      {/* Channels */}
      {others.length > 0 && (
        <>
          <div className="section-header">Channels</div>
          <div style={{ margin: '0 8px' }}>{others.map((ch, i) => renderRow(ch, i + projects.length))}</div>
        </>
      )}
    </div>
  )
}

// ─── Chat ───────────────────────────────────────────────
type Attachment = { id: string; name: string; url: string; isImage: boolean; size: number }

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeBlockLines: string[] = []
  let codeBlockLang = ''
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Code blocks ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre key={i} style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
            marginBottom: 8,
            overflow: 'auto',
            fontSize: '0.72rem',
            lineHeight: 1.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        )
        inCodeBlock = false
        codeBlockLines = []
        codeBlockLang = ''
      } else {
        // Start code block
        inCodeBlock = true
        codeBlockLang = line.trim().slice(3).trim()
      }
      continue
    }
    
    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }
    
    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 12, marginBottom: 6, color: 'var(--text-primary)' }}>{line.slice(4)}</h3>)
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: '1rem', fontWeight: 700, marginTop: 14, marginBottom: 8, color: 'var(--text-primary)' }}>{line.slice(3)}</h2>)
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 16, marginBottom: 10, color: 'var(--text-primary)' }}>{line.slice(2)}</h1>)
      continue
    }
    
    // Bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginLeft: 0, marginBottom: 4 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>•</span>
          <span>{processInlineMarkdown(line.trim().slice(2))}</span>
        </div>
      )
      continue
    }
    
    // Regular line with inline markdown
    if (line.trim()) {
      elements.push(<div key={i} style={{ marginBottom: 4 }}>{processInlineMarkdown(line)}</div>)
    } else {
      elements.push(<div key={i} style={{ height: 4 }} />)
    }
  }
  
  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key="unclosed" style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: 10,
        marginTop: 8,
        marginBottom: 8,
        overflow: 'auto',
        fontSize: '0.72rem',
        lineHeight: 1.5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}>
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    )
  }
  
  return <div>{elements}</div>
}

function ChatView({ channelId }: { channelId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ id: string; role: string; text: string; timestamp: string; sender?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [speechInterim, setSpeechInterim] = useState('')
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkInfo, setLinkInfo] = useState<{ topicId?: string | null; sessionId?: string | null } | null>(null)

  const loadMessages = useCallback(() => {
    setLoading(true)
    fetch(`/api/topics?channel=${encodeURIComponent(channelId)}&limit=80`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) {
          setMessages(data.messages)
          const totalCount = data.total || data.messages.length
          setTotal(totalCount)
          saveReadCount(channelId, totalCount)
          setLinkInfo({
            topicId: data.topicId || data.link?.telegram?.topicId || null,
            sessionId: data.sessionId || data.link?.sessionId || null,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [channelId])

  const handleLinkTelegram = useCallback(async () => {
    const suggested = String(linkInfo?.topicId || '')
    const topicId = window.prompt('Telegram Topic ID to link to this project', suggested)
    if (topicId === null) return

    const trimmed = topicId.trim()
    setLinking(true)
    try {
      await fetch('/api/channel-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelId,
          telegramTopicId: trimmed || undefined,
          telegramThreadId: trimmed || undefined,
          autoSession: true,
        }),
      })
      setTimeout(() => loadMessages(), 250)
    } catch {
      // no-op
    } finally {
      setLinking(false)
    }
  }, [channelId, linkInfo?.topicId, loadMessages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text && attachments.length === 0) return

    const attachmentNote = attachments.length
      ? `\n\nAttachments:\n${attachments.map(a => `- ${a.name}`).join('\n')}`
      : ''

    const optimistic = {
      id: `local-${Date.now()}`,
      role: 'user',
      text: `${text || '(attachment)'}${attachmentNote}`,
      timestamp: new Date().toISOString(),
      sender: 'Alex',
    }

    setMessages(prev => [...prev, optimistic])
    setInput('')

    try {
      await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channelId,
          text,
          attachments,
        }),
      })
    } catch {}

    setAttachments([])

    // Sync with persisted session/thread state shortly after queueing
    setTimeout(() => loadMessages(), 600)
    setTimeout(() => loadMessages(), 2200)
  }, [input, attachments, channelId, loadMessages])

  // Dictation (Web Speech API)
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSpeechSupported(false)
      return
    }

    setSpeechSupported(true)
    const rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setIsListening(true)
      setSpeechError(null)
      setSpeechInterim('')
    }

    rec.onresult = (event: any) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) finalText += chunk
        else interim += chunk
      }
      setSpeechInterim(interim.trim())
      if (finalText.trim()) {
        setInput(prev => `${prev}${prev.trim() ? ' ' : ''}${finalText.trim()}`)
      }
    }

    rec.onerror = (event: any) => {
      setSpeechError(event?.error ? `Dictation error: ${event.error}` : 'Dictation error')
      setIsListening(false)
      setSpeechInterim('')
    }

    rec.onend = () => {
      setIsListening(false)
      setSpeechInterim('')
    }

    recognitionRef.current = rec
    return () => {
      try { rec.stop() } catch {}
      if (recognitionRef.current === rec) recognitionRef.current = null
    }
  }, [])

  const toggleDictation = () => {
    if (!speechSupported) {
      setSpeechError('Dictation is not supported in this browser')
      return
    }
    const rec = recognitionRef.current
    if (!rec) return
    try {
      if (isListening) rec.stop()
      else rec.start()
    } catch {
      setSpeechError('Unable to start dictation')
    }
  }

  // Load real messages from topic API
  useEffect(() => {
    loadMessages()
    const iv = setInterval(loadMessages, 12000)
    return () => clearInterval(iv)
  }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const channelInfo = CHANNELS.find(c => c.id === channelId)
  const channelColor = channelInfo?.color || 'var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 44px)', background: '#000' }}>
      {/* Messages area — ChatGPT style: full-width, no bubbles, clean */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '8px 10px', borderRadius: 10,
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.22)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.62rem', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Channel Link</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', marginTop: 2 }}>
                {linkInfo?.topicId
                  ? `Telegram topic #${linkInfo.topicId}`
                  : 'Web-only project chat (not linked to Telegram)'}
              </div>
              {linkInfo?.sessionId && (
                <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'monospace' }}>
                  session {String(linkInfo.sessionId).slice(0, 8)}…
                </div>
              )}
            </div>
            <button
              onClick={handleLinkTelegram}
              disabled={linking}
              style={{
                padding: '6px 9px', borderRadius: 8,
                border: '1px solid rgba(59,130,246,0.35)',
                background: linking ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.12)',
                color: '#93c5fd', fontSize: '0.66rem', fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {linking ? 'Linking…' : (linkInfo?.topicId ? 'Relink' : 'Link Telegram')}
            </button>
          </div>
        </div>

        {loading && <LobsterLoader label="Loading messages…" minHeight={320} />}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, margin: '0 auto 12px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={18} style={{ color: channelColor }} />
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: 500, margin: '0 0 4px' }}>
              {channelInfo?.name || channelId}
            </p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem', opacity: 0.6 }}>No messages yet</p>
          </div>
        )}

        {!loading && total > messages.length && (
          <div style={{
            textAlign: 'center', padding: '8px 0 12px', fontSize: '0.64rem',
            color: 'var(--text-tertiary)', opacity: 0.5,
          }}>
            Showing last {messages.length} of {total} messages
          </div>
        )}

        {messages.map((m, i) => {
          // Check if message is from ClawPanel web chat
          const isWebChatUser = m.text.includes('[source: ClawPanel web chat]')
          const isUser = m.role === 'user' || isWebChatUser
          const isSystem = m.role === 'system' && !isWebChatUser
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

          // Board activity messages — compact inline style
          if (isSystem) {
            return (
              <div key={m.id || i} style={{
                padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{
                  flex: 1, fontSize: '0.68rem', color: 'var(--text-tertiary)',
                  fontStyle: 'italic', lineHeight: 1.4,
                }}>
                  {m.text}
                </div>
                {time && <span style={{ fontSize: '0.54rem', color: 'var(--text-tertiary)', opacity: 0.5, flexShrink: 0 }}>{time}</span>}
              </div>
            )
          }

          return (
            <div key={m.id || i} style={{
              padding: '12px 16px',
              background: isUser ? 'transparent' : 'rgba(255,255,255,0.02)',
            }}>
              {/* Role indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {isUser ? (
                  <div style={{
                    width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)',
                  }}>
                    {(m.sender || 'A')[0].toUpperCase()}
                  </div>
                ) : (
                  <div style={{
                    width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                    background: `${channelColor}15`, border: `1px solid ${channelColor}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Bot size={11} style={{ color: channelColor }} />
                  </div>
                )}
                <span style={{
                  fontSize: '0.72rem', fontWeight: 600,
                  color: isUser ? 'var(--text-primary)' : channelColor,
                }}>
                  {isUser ? (m.sender || 'Alex') : 'Eve'}
                </span>
                {time && (
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {time}
                  </span>
                )}
              </div>

              {/* Message content — ChatGPT style: full width, no bubble */}
              <div style={{
                fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.6,
                paddingLeft: 30,
              }}>
                {/* Detect and render inline images */}
                {(() => {
                  const text = m.text.length > 3000 ? m.text.slice(0, 3000) + '\n…(truncated)' : m.text
                  // Check for image attachment markers or media references
                  const imgMatch = text.match(/\[media attached:.*?\.(jpg|jpeg|png|gif|webp).*?\]/i)
                    || text.match(/MEDIA:(\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i)
                  const hasImage = imgMatch !== null
                  // Strip media markers and web chat source tag from display text
                  const cleanText = text
                    .replace(/\[media attached:[^\]]*\]\n?/g, '')
                    .replace(/To send an image back[^\n]*\n?/g, '')
                    .replace(/MEDIA:[^\s]+\n?/g, '')
                    .replace(/\[source: ClawPanel web chat\]\n?/g, '')
                    .trim()

                  return (
                    <>
                      {hasImage && (
                        <div style={{
                          marginBottom: 8, borderRadius: 12, overflow: 'hidden',
                          maxWidth: 280, border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                          <div style={{
                            padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <Eye size={14} style={{ color: 'var(--text-tertiary)' }} />
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              Image attachment
                            </span>
                          </div>
                        </div>
                      )}
                      {renderMarkdown(cleanText)}
                    </>
                  )
                })()}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area — ChatGPT style */}
      <div style={{
        padding: '0 12px 0', paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        background: '#000',
      }}>
        {(isListening || speechInterim || speechError) && (
          <div style={{
            margin: '0 4px 6px', padding: '6px 9px', borderRadius: 9,
            border: `1px solid ${speechError ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.28)'}`,
            background: speechError ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
            fontSize: '0.66rem', color: speechError ? '#ef4444' : '#93c5fd',
            lineHeight: 1.45,
          }}>
            {speechError ? speechError : isListening ? `Listening… ${speechInterim || ''}` : speechInterim}
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, padding: '8px 4px 4px', overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            {attachments.map(att => (
              <div key={att.id} style={{
                position: 'relative', flexShrink: 0,
                borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
              }}>
                {att.isImage ? (
                  <img src={att.url} alt={att.name} style={{
                    width: 64, height: 64, objectFit: 'cover', display: 'block',
                  }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', padding: 4,
                  }}>
                    <FileText size={18} style={{ color: 'var(--text-tertiary)', marginBottom: 2 }} />
                    <span style={{
                      fontSize: '0.48rem', color: 'var(--text-tertiary)',
                      textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', width: '100%', padding: '0 2px',
                    }}>{att.name}</span>
                  </div>
                )}
                {/* Remove button */}
                <button
                  onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 18, height: 18, borderRadius: 9,
                    background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', lineHeight: 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >×</button>
              </div>
            ))}
            {uploading && (
              <div style={{
                width: 64, height: 64, borderRadius: 12, flexShrink: 0,
                border: '1px dashed rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>…</span>
              </div>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.csv,.yml,.yaml,.log,.py,.js,.ts,.jsx,.tsx"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const files = e.target.files
            if (!files?.length) return
            setUploading(true)
            for (const file of Array.from(files)) {
              try {
                const form = new FormData()
                form.append('file', file)
                form.append('channel', channelId)
                const res = await fetch('/api/upload', { method: 'POST', body: form })
                const data = await res.json()
                if (data.ok && data.file) {
                  setAttachments(prev => [...prev, {
                    id: data.file.id,
                    name: data.file.name,
                    url: data.file.url,
                    isImage: data.file.isImage,
                    size: data.file.size,
                  }])
                }
              } catch {}
            }
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
          }}
        />

        {/* Input bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 24, padding: '4px 4px 4px 6px',
        }}>
          {/* Attach button */}
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width: 30, height: 30, borderRadius: 15, flexShrink: 0,
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              transition: 'color 0.15s',
            }}
          >
            <Plus size={18} />
          </button>

          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: '0.82rem', color: 'var(--text-primary)',
              outline: 'none', WebkitAppearance: 'none',
              fontFamily: 'var(--font-jakarta), sans-serif',
            }}
          />

          <button
            onClick={toggleDictation}
            title={speechSupported ? (isListening ? 'Stop dictation' : 'Start dictation') : 'Dictation unsupported'}
            style={{
              width: 32, height: 32, borderRadius: 16, flexShrink: 0,
              background: isListening ? 'rgba(239,68,68,0.18)' : 'transparent',
              color: isListening ? '#ef4444' : speechSupported ? 'var(--text-tertiary)' : 'rgba(107,114,128,0.8)',
              border: isListening ? '1px solid rgba(239,68,68,0.35)' : 'none',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>

          <button onClick={handleSend} style={{
            width: 32, height: 32, borderRadius: 16, flexShrink: 0,
            background: (input.trim() || attachments.length) ? '#fff' : 'rgba(255,255,255,0.08)',
            color: (input.trim() || attachments.length) ? '#000' : 'var(--text-tertiary)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
          }}>
            <Send size={13} style={{ marginLeft: 1 }} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban ─────────────────────────────────────────────

// Column order for move actions
const COL_ORDER = ['backlog', 'in-progress', 'review', 'done']

function KanbanView({ columns, setColumns }: { columns: KanbanCol[]; setColumns: (cols: KanbanCol[]) => void }) {
  const [filter, setFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({})
  const [noteSent, setNoteSent] = useState<string | null>(null)

  // Unique projects
  const allProjects = Array.from(new Set(columns.flatMap(c => c.cards.map(card => card.project)))).sort()

  // Filter cards
  const filteredCols = columns.map(col => ({
    ...col,
    cards: filter === 'all' ? col.cards : col.cards.filter(c => c.project === filter),
  }))

  // Fire board action event (JSONL queue for Eve/Minerva)
  const fireAction = (payload: Record<string, unknown>) => {
    fetch('/api/board/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }

  // Move card between columns
  const moveCard = (cardId: string, fromColId: string, toColId: string) => {
    const card = columns.find(c => c.id === fromColId)?.cards.find(c => c.id === cardId)
    setColumns(columns.map(col => {
      if (col.id === fromColId) return { ...col, cards: col.cards.filter(c => c.id !== cardId) }
      if (col.id === toColId) {
        if (card) return { ...col, cards: [...col.cards, card] }
      }
      return col
    }))
    if (card) {
      fireAction({
        cardId, ticketId: card.ticketId, cardTitle: card.title, project: card.project, assignee: card.assignee,
        fromColumn: fromColId, toColumn: toColId, action: 'move',
      })
    }
    setExpanded(null)
  }

  // Delete card
  const deleteCard = (cardId: string, colId: string) => {
    const card = columns.find(c => c.id === colId)?.cards.find(c => c.id === cardId)
    setColumns(columns.map(col =>
      col.id === colId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col
    ))
    if (card) {
      fireAction({
        cardId, ticketId: card.ticketId, cardTitle: card.title, project: card.project, assignee: card.assignee,
        fromColumn: colId, toColumn: null, action: 'delete',
      })
    }
    setExpanded(null)
  }

  // Get actions for a card based on its column
  const getActions = (colId: string, cardId: string): Array<{ label: string; icon: React.ReactNode; color: string; action: () => void }> => {
    const actions: Array<{ label: string; icon: React.ReactNode; color: string; action: () => void }> = []
    const colIdx = COL_ORDER.indexOf(colId)

    if (colId === 'backlog') {
      actions.push({ label: 'Start', icon: <ChevronRight size={12} />, color: '#3b82f6', action: () => moveCard(cardId, colId, 'in-progress') })
    }
    if (colId === 'in-progress') {
      actions.push({ label: 'To Review', icon: <ChevronRight size={12} />, color: '#f59e0b', action: () => moveCard(cardId, colId, 'review') })
      actions.push({ label: 'Back to Backlog', icon: <ArrowLeft size={12} />, color: 'var(--text-secondary)', action: () => moveCard(cardId, colId, 'backlog') })
    }
    if (colId === 'review') {
      actions.push({ label: 'Done', icon: <Check size={12} />, color: '#10b981', action: () => moveCard(cardId, colId, 'done') })
      actions.push({ label: 'Back to Backlog', icon: <ArrowLeft size={12} />, color: 'var(--text-secondary)', action: () => moveCard(cardId, colId, 'backlog') })
    }
    if (colId === 'done') {
      actions.push({ label: 'Reopen', icon: <RotateCcw size={12} />, color: '#f59e0b', action: () => moveCard(cardId, colId, 'in-progress') })
    }

    // Delete always available
    if (colIdx >= 0) {
      actions.push({ label: 'Delete', icon: <Trash2 size={12} />, color: '#ef4444', action: () => deleteCard(cardId, colId) })
    }
    return actions
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 44px)' }}>
      {/* Top bar: filter pills + refresh */}
      <div style={{
        padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6,
        borderBottom: '1px solid var(--separator)', flexShrink: 0,
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 5, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {['all', ...allProjects].map(p => {
            const isActive = filter === p
            return (
              <button
                key={p}
                onClick={() => setFilter(p)}
                style={{
                  padding: '4px 11px', borderRadius: 14, fontSize: '0.68rem', fontWeight: 600,
                  border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  fontFamily: 'var(--font-jakarta), sans-serif',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  borderColor: isActive ? 'var(--accent)' : 'var(--separator)',
                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                }}
              >
                {p === 'all' ? 'All' : p}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-tertiary)',
            cursor: 'pointer', padding: 6, flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Columns — horizontal scroll, constrained to viewport */}
      <div key={refreshKey} style={{
        flex: 1, display: 'flex', overflowX: 'auto', padding: '8px 8px 0',
        gap: 8, alignItems: 'flex-start', WebkitOverflowScrolling: 'touch',
        maxWidth: '100vw',
      }}>
        {filteredCols.map((col, colIndex) => (
          <div key={col.id} style={{
            width: 'min(72vw, 280px)', minWidth: 'min(72vw, 280px)', maxWidth: '80vw', flexShrink: 0,
            display: 'flex', flexDirection: 'column', maxHeight: '100%',
          }}>
            {/* Column header */}
            <div style={{
              padding: '4px 4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-space-grotesk)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                {col.label}
              </div>
              <span style={{
                color: 'var(--text-tertiary)', fontSize: '0.6rem',
                background: 'var(--bg-tertiary)', borderRadius: 4, padding: '1px 6px',
              }}>{col.cards.length}</span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 12 }}>
              {col.cards.map((card, i) => {
                const isExpanded = expanded === card.id
                const actions = getActions(col.id, card.id)
                const projectColor = CHANNELS.find(c => c.id === card.project)?.color ?? '#666'
                const isAssignedToAlex = card.assignee.toLowerCase() === 'alex'

                return (
                  <motion.div key={card.id} custom={colIndex * 4 + i} variants={fadeUp} initial="hidden" animate="visible">
                    <div
                      role="button" tabIndex={0}
                      onClick={() => setExpanded(isExpanded ? null : card.id)}
                      onKeyDown={e => e.key === 'Enter' && setExpanded(isExpanded ? null : card.id)}
                      className="glass-card clickable"
                      style={{
                        padding: '10px 12px', width: '100%', maxWidth: '100%', boxSizing: 'border-box',
                        transition: 'border-color 0.15s',
                        borderColor: isAssignedToAlex ? 'rgba(245,158,11,0.35)' : isExpanded ? 'rgba(255,255,255,0.15)' : undefined,
                        background: isAssignedToAlex ? 'rgba(245,158,11,0.06)' : undefined,
                      }}
                    >
                      {/* Card header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          {card.ticketId && (
                            <span style={{
                              fontSize: '0.56rem', fontWeight: 700, fontFamily: 'monospace',
                              color: projectColor, opacity: 0.8, marginRight: 6,
                              letterSpacing: '0.02em',
                            }}>{card.ticketId}</span>
                          )}
                          <span style={{ fontSize: '0.78rem', fontWeight: 500, lineHeight: 1.35, color: 'var(--text-primary)' }}>
                            {card.title}
                          </span>
                        </div>
                        <ChevronDown size={12} style={{
                          color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2,
                          transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }} />
                      </div>

                      {/* Tags row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{
                          fontSize: '0.58rem', fontWeight: 500,
                          color: projectColor, background: `${projectColor}18`,
                          border: `1px solid ${projectColor}30`, borderRadius: 6, padding: '2px 7px',
                        }}>
                          {card.project}
                        </span>
                        <span style={{
                          fontSize: '0.6rem', fontWeight: isAssignedToAlex ? 600 : 400,
                          color: isAssignedToAlex ? '#f59e0b' : 'var(--text-tertiary)',
                          ...(isAssignedToAlex ? { background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '1px 5px' } : {}),
                        }}>{card.assignee}</span>
                      </div>

                      {/* Expanded section */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                            style={{ overflow: 'hidden' }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {/* Description */}
                            {card.description && (
                              <div style={{
                                marginTop: 10, padding: '8px 10px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--separator)',
                                fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                              }}>
                                {card.description}
                              </div>
                            )}

                            {/* Input for Alex-assigned cards */}
                            {isAssignedToAlex && (
                              <div style={{ marginTop: 8 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                <textarea
                                  placeholder="Add notes or context…"
                                  rows={2}
                                  value={noteTexts[card.id] || ''}
                                  onChange={e => setNoteTexts(prev => ({ ...prev, [card.id]: e.target.value }))}
                                  style={{
                                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                                    background: 'var(--bg-primary)', border: '1px solid var(--separator-strong)',
                                    borderRadius: 8, padding: '8px 10px', fontSize: '0.72rem',
                                    color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-jakarta), sans-serif',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                                  <button
                                    onClick={() => {
                                      const text = noteTexts[card.id]?.trim()
                                      if (!text) return
                                      fireAction({
                                        cardId: card.id, ticketId: card.ticketId, cardTitle: card.title, project: card.project,
                                        assignee: card.assignee, fromColumn: col.id, toColumn: null,
                                        action: 'note', notes: text,
                                      })
                                      setNoteTexts(prev => ({ ...prev, [card.id]: '' }))
                                      setNoteSent(card.id)
                                      setTimeout(() => setNoteSent(null), 1500)
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                      borderRadius: 8, fontSize: '0.64rem', fontWeight: 600,
                                      background: noteSent === card.id ? 'rgba(16,185,129,0.15)' : 'var(--accent)',
                                      border: noteSent === card.id ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                                      color: noteSent === card.id ? '#10b981' : '#fff',
                                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    <Send size={11} /> {noteSent === card.id ? 'Sent ✓' : 'Submit'}
                                  </button>
                                  <button style={{
                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                    borderRadius: 8, fontSize: '0.64rem', fontWeight: 500,
                                    background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
                                    color: 'var(--text-secondary)', cursor: 'pointer',
                                    WebkitTapHighlightColor: 'transparent',
                                  }}>
                                    <Paperclip size={11} /> Attach
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                              {actions.map(act => (
                                <button
                                  key={act.label}
                                  onClick={(e) => { e.stopPropagation(); act.action() }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '5px 10px', borderRadius: 8, fontSize: '0.66rem', fontWeight: 600,
                                    background: act.color === '#ef4444' ? 'rgba(239,68,68,0.1)' : `${act.color}15`,
                                    border: `1px solid ${act.color}30`, color: act.color,
                                    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                                    touchAction: 'manipulation', fontFamily: 'var(--font-jakarta), sans-serif',
                                  }}
                                >
                                  {act.icon}
                                  {act.label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
              {col.cards.length === 0 && (
                <div style={{
                  padding: 16, textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)',
                  border: '1px dashed var(--separator)', borderRadius: 10,
                }}>
                  No cards
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cron Detail ────────────────────────────────────────
function CronDetailPage({ jobId }: { jobId: string }) {
  const [detail, setDetail] = useState<CronDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPrompt, setShowPrompt] = useState(false)
  const [expandedRun, setExpandedRun] = useState<number | null>(null)
  const [runTranscripts, setRunTranscripts] = useState<Record<string, Array<{ role: string; content: string }>>>({})
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null)
  const [models, setModels] = useState<Array<{ id: string; alias?: string }>>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [runbookText, setRunbookText] = useState<string | null>(null)
  const [loadingRunbook, setLoadingRunbook] = useState(false)
  const [copiedErrorTs, setCopiedErrorTs] = useState<number | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      fetch(`/api/cron-detail?id=${encodeURIComponent(jobId)}`).then(r => r.json()),
      fetch('/api/agent-config').then(r => r.json()),
    ]).then(([detailRes, modelRes]) => {
      if (detailRes.status === 'fulfilled' && detailRes.value?.id) {
        setDetail(detailRes.value)
        setSelectedModel(detailRes.value?.payload?.model || '')
      }
      if (modelRes.status === 'fulfilled') {
        setModels(modelRes.value?.models ?? [])
      }
    }).finally(() => setLoading(false))
  }, [jobId])

  if (loading || !detail) {
    return <LobsterLoader label="Loading job detail…" />
  }

  const sched = detail.schedule as Record<string, string>
  const schedStr = sched.kind === 'cron' ? sched.expr : sched.kind === 'every' ? `every ${Math.round(Number(sched.everyMs) / 60000)}m` : sched.kind === 'at' ? 'one-shot' : String(sched.kind)
  const state = detail.state as Record<string, number>
  const isEnabled = detail.enabled

  const runbookRefMatch = detail.payload.prompt.match(/RUNBOOK_REF:(.+)/)
  const runbookRef = runbookRefMatch ? runbookRefMatch[1].trim() : null

  const loadRunbook = async () => {
    if (!runbookRef || loadingRunbook) return
    if (runbookText !== null) {
      setRunbookText(null)
      return
    }
    setLoadingRunbook(true)
    try {
      const res = await fetch(`/api/read-file?path=${encodeURIComponent(runbookRef)}`)
      const data = await res.json()
      setRunbookText(data.content || 'Runbook read failed')
    } catch {
      setRunbookText('Runbook read failed')
    } finally {
      setLoadingRunbook(false)
    }
  }

  const saveModel = async () => {
    if (!selectedModel || !detail.payload.editableModel || savingModel) return
    setSavingModel(true)
    try {
      const res = await fetch('/api/cron-update-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: detail.id, model: selectedModel }),
      })
      if (res.ok) {
        setDetail({ ...detail, payload: { ...detail.payload, model: selectedModel, explicitModel: selectedModel, modelSource: 'job-payload' } })
      }
    } catch {}
    setSavingModel(false)
  }

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}>
        <div style={{ padding: '18px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Clock size={20} style={{ color: isEnabled ? 'var(--accent)' : 'var(--text-tertiary)' }} />
            <h2 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: '1.1rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              {detail.name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.62rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              background: isEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.15)',
              color: isEnabled ? '#10b981' : '#6b7280',
            }}>{isEnabled ? 'Enabled' : 'Disabled'}</span>
            <span style={{
              fontSize: '0.62rem', padding: '3px 8px', borderRadius: 6,
              background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontFamily: 'monospace',
            }}>{schedStr}</span>
          </div>
        </div>
      </motion.div>

      {/* Config section */}
      <div className="section-header">Configuration</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '2px 0', marginBottom: 6 }}>
            <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--separator)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Model</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>source: {detail.payload.modelSource || 'unknown'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={selectedModel}
                  disabled={!detail.payload.editableModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-primary)', border: '1px solid var(--separator)', borderRadius: 8,
                    color: 'var(--text-primary)', fontSize: '0.68rem', padding: '7px 9px',
                    fontFamily: 'monospace',
                  }}
                >
                  {[selectedModel, ...models.map((m) => m.id)].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={saveModel}
                  disabled={!detail.payload.editableModel || savingModel || selectedModel === detail.payload.model}
                  style={{
                    padding: '0 10px', borderRadius: 8,
                    border: '1px solid var(--separator)', background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)', fontSize: '0.66rem', fontWeight: 600,
                    opacity: (!detail.payload.editableModel || savingModel || selectedModel === detail.payload.model) ? 0.5 : 1,
                  }}
                >{savingModel ? 'Saving…' : 'Save'}</button>
              </div>
              {!detail.payload.editableModel && (
                <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Model override disabled for code/system-event jobs.
                </div>
              )}
            </div>

            {[
              { key: 'Thinking', value: detail.payload.thinking || 'default' },
              { key: 'Agent', value: detail.agentId || '—' },
              { key: 'Timezone', value: (sched.tz as string) || 'UTC' },
            ].map((row, ri, arr) => (
              <div key={row.key} style={{
                padding: '9px 14px', display: 'flex', justifyContent: 'space-between', gap: 12,
                borderBottom: ri < arr.length - 1 ? '1px solid var(--separator)' : 'none',
              }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{row.key}</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Prompt section — expandable */}
      <div className="section-header">Prompt</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <div
            role="button" tabIndex={0}
            onClick={() => setShowPrompt(!showPrompt)}
            onKeyDown={e => e.key === 'Enter' && setShowPrompt(!showPrompt)}
            className="glass-card clickable"
            style={{ padding: '10px 13px', marginBottom: 6 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>
                {showPrompt ? 'Hide prompt' : 'View prompt'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); copyText(detail.payload.prompt); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1200) }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: '1px solid var(--separator)',
                    background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.62rem',
                  }}
                >{copiedPrompt ? 'Copied' : 'Copy'}</button>
                <ChevronDown size={13} style={{
                  color: 'var(--text-tertiary)',
                  transition: 'transform 0.2s', transform: showPrompt ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </div>
            </div>
            <AnimatePresence>
              {showPrompt && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <pre style={{
                    marginTop: 10, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-primary)', border: '1px solid var(--separator)',
                    fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto',
                    fontFamily: 'monospace',
                  }}>
                    {detail.payload.prompt}
                  </pre>

                  {runbookRef && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{runbookRef}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); loadRunbook() }}
                          style={{
                            padding: '3px 8px', borderRadius: 6, border: '1px solid var(--separator)',
                            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.62rem',
                          }}
                        >{loadingRunbook ? 'Loading…' : runbookText ? 'Hide runbook' : 'Read runbook_ref'}</button>
                      </div>
                      {runbookText && (
                        <pre style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: 'var(--bg-primary)', border: '1px solid var(--separator)',
                          fontSize: '0.64rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto',
                          fontFamily: 'monospace',
                        }}>{runbookText}</pre>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Recent runs */}
      <div className="section-header">Recent Runs ({detail.runs.length})</div>
      <div style={{ margin: '0 8px' }}>
        {detail.runs.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>No runs recorded</div>
        )}
        {detail.runs.map((run, i) => {
          const isOk = run.status === 'ok'
          const date = new Date(run.ts)
          const isExpanded = expandedRun === run.ts
          const runKey = run.sessionId || String(run.ts)
          const transcript = runTranscripts[runKey]
          const isLoadingThis = loadingTranscript === runKey

          const toggleRun = () => {
            if (isExpanded) {
              setExpandedRun(null)
              return
            }
            setExpandedRun(run.ts)
            // Load transcript if not already loaded and sessionId exists
            if (!transcript && run.sessionId) {
              setLoadingTranscript(runKey)
              fetch(`/api/cron-detail/run?sessionId=${encodeURIComponent(run.sessionId)}&agentId=${encodeURIComponent(detail.agentId)}`)
                .then(r => r.json())
                .then(data => {
                  if (data.messages) {
                    setRunTranscripts(prev => ({ ...prev, [runKey]: data.messages }))
                  }
                })
                .catch(() => {})
                .finally(() => setLoadingTranscript(null))
            }
          }

          return (
            <motion.div key={run.ts} custom={i + 2} variants={fadeUp} initial="hidden" animate="visible">
              <div
                role="button" tabIndex={0}
                onClick={toggleRun}
                onKeyDown={e => e.key === 'Enter' && toggleRun()}
                className="glass-card clickable"
                style={{
                  padding: '10px 12px', marginBottom: 5,
                  borderColor: isExpanded ? 'rgba(255,255,255,0.15)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`status-dot ${isOk ? 'green' : 'red'}`} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 500, flex: 1 }}>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  {run.durationMs && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{Math.round(run.durationMs / 1000)}s</span>
                  )}
                  <ChevronDown size={12} style={{
                    color: 'var(--text-tertiary)', flexShrink: 0,
                    transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  }} />
                </div>
                {!isExpanded && run.summary && (
                  <div style={{
                    fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    paddingLeft: 14,
                  }}>
                    {run.summary.slice(0, 200)}{run.summary.length > 200 ? '…' : ''}
                  </div>
                )}
                {!isExpanded && run.error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 14 }}>
                    <div style={{ fontSize: '0.66rem', color: '#ef4444', lineHeight: 1.4, flex: 1 }}>
                      {run.error.slice(0, 150)}{run.error.length > 150 ? '…' : ''}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyText(run.error || ''); setCopiedErrorTs(run.ts); setTimeout(() => setCopiedErrorTs(null), 1200) }}
                      style={{
                        padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                        background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.6rem',
                      }}
                    >{copiedErrorTs === run.ts ? 'Copied' : 'Copy'}</button>
                  </div>
                )}

                {/* Expanded run context */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      {/* Full summary */}
                      {run.summary && (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--separator)',
                          fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto',
                        }}>
                          {run.summary}
                        </div>
                      )}
                      {run.error && (
                        <div style={{
                          marginTop: 6, padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                          fontSize: '0.66rem', color: '#ef4444', lineHeight: 1.5,
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyText(run.error || ''); setCopiedErrorTs(run.ts); setTimeout(() => setCopiedErrorTs(null), 1200) }}
                              style={{
                                padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                                background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.6rem',
                              }}
                            >{copiedErrorTs === run.ts ? 'Copied' : 'Copy error'}</button>
                          </div>
                          {run.error}
                        </div>
                      )}

                      {/* Transcript */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          fontSize: '0.64rem', fontWeight: 600, color: 'var(--text-tertiary)',
                          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
                        }}>
                          Transcript
                        </div>
                        {isLoadingThis && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', padding: '8px 0' }}>Loading transcript…</div>
                        )}
                        {!isLoadingThis && !transcript && !run.sessionId && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', padding: '4px 0' }}>No session data available</div>
                        )}
                        {!isLoadingThis && transcript && transcript.length === 0 && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', padding: '4px 0' }}>Empty transcript</div>
                        )}
                        {transcript && transcript.length > 0 && (
                          <div style={{
                            maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
                            padding: '8px 0',
                          }}>
                            {transcript.map((msg, mi) => (
                              <div key={mi} style={{
                                padding: '8px 10px', borderRadius: 8,
                                background: msg.role === 'assistant' ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${msg.role === 'assistant' ? 'rgba(59,130,246,0.15)' : 'var(--separator)'}`,
                              }}>
                                <div style={{
                                  fontSize: '0.58rem', fontWeight: 600, textTransform: 'uppercase',
                                  color: msg.role === 'assistant' ? '#3b82f6' : 'var(--text-tertiary)',
                                  marginBottom: 4, letterSpacing: '0.04em',
                                }}>
                                  {msg.role}
                                </div>
                                <div style={{
                                  fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}>
                                  {msg.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Workflows ──────────────────────────────────────────
function WorkflowsPage({ onEdit, onCreate }: { onEdit: (id: string) => void; onCreate: () => void }) {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/workflows')
      .then(r => r.json())
      .then(data => { if (data.workflows) setWorkflows(data.workflows) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <LobsterLoader label="Loading squads…" />
  }

  const roleColors: Record<string, string> = {
    analysis: '#8b5cf6', coding: '#3b82f6', testing: '#f59e0b', review: '#10b981', security: '#ef4444',
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="section-header">Squads ({workflows.length})</div>
      <div style={{ margin: '0 8px', marginBottom: 6 }}>
        <button
          onClick={onCreate}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: '1px dashed var(--separator-strong)', background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600,
          }}
        >+ Add new squad / workflow</button>
      </div>
      <div style={{ margin: '0 8px' }}>
        {workflows.map((wf, i) => {
          const isExpanded = expanded === wf.id
          const runtime = wf.runtime
          const runtimeColor = runtime?.status === 'failed' ? '#ef4444' : runtime?.status === 'running' ? '#10b981' : runtime?.status === 'completed' ? '#60a5fa' : 'var(--text-tertiary)'
          const runtimeLabel = runtime?.status === 'failed' ? 'Failed' : runtime?.status === 'running' ? 'Running' : runtime?.status === 'completed' ? 'Completed' : 'Idle'
          return (
            <motion.div key={wf.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <div
                role="button" tabIndex={0}
                onClick={() => setExpanded(isExpanded ? null : wf.id)}
                onKeyDown={e => e.key === 'Enter' && setExpanded(isExpanded ? null : wf.id)}
                className="glass-card clickable"
                style={{ padding: '12px 14px', marginBottom: 6, transition: 'border-color 0.15s', borderColor: isExpanded ? 'rgba(255,255,255,0.15)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GitBranch size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{wf.name}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: 1 }}>
                        v{wf.version} · {wf.agents.length} agents · {runtime?.runningSteps ?? 0} running / {runtime?.queuedSteps ?? 0} queued
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: '0.58rem', fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                      background: `${runtimeColor}1a`, color: runtimeColor,
                      border: `1px solid ${runtimeColor}33`,
                    }}>{runtimeLabel}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(wf.id) }}
                      style={{
                        padding: '3px 8px', borderRadius: 6, border: '1px solid var(--separator)',
                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.62rem',
                      }}
                    >Edit</button>
                    <ChevronDown size={13} style={{
                      color: 'var(--text-tertiary)', flexShrink: 0,
                      transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      {/* Description */}
                      {wf.description && (
                        <div style={{
                          marginTop: 10, padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--separator)',
                          fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5,
                        }}>
                          {wf.description}
                        </div>
                      )}

                      {/* Agent pipeline */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Team Roles
                        </div>
                        {wf.agents.map((agent, ai) => (
                          <div key={agent.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                            borderBottom: ai < wf.agents.length - 1 ? '1px solid var(--separator)' : 'none',
                          }}>
                            <span style={{
                              fontSize: '0.58rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                              background: `${roleColors[agent.role] || '#6b7280'}18`,
                              color: roleColors[agent.role] || '#6b7280',
                              border: `1px solid ${roleColors[agent.role] || '#6b7280'}30`,
                              flexShrink: 0, minWidth: 50, textAlign: 'center',
                            }}>{agent.role}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.74rem', fontWeight: 500 }}>{agent.name}</div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {agent.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Squad Settings ─────────────────────────────────────
type WorkflowSettings = {
  id: string
  name: string
  version: number
  description: string
  agents: Array<{ id: string; name: string; role: string; model: string; description: string }>
  steps: Array<{ id: string; agent: string; input: string }>
}

function SquadSettingsPage({ workflowId, onSaved }: { workflowId?: string; onSaved: () => void }) {
  const [wf, setWf] = useState<WorkflowSettings>({
    id: workflowId || '',
    name: workflowId ? workflowId : '',
    version: 1,
    description: '',
    agents: [],
    steps: [],
  })
  const [models, setModels] = useState<Array<{ id: string; alias?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)

  useEffect(() => {
    Promise.allSettled([
      workflowId ? fetch(`/api/workflow-settings?id=${encodeURIComponent(workflowId)}`).then(r => r.json()) : Promise.resolve({ workflow: wf }),
      fetch('/api/agent-config').then(r => r.json()),
    ]).then(([wfRes, modelRes]) => {
      if (wfRes.status === 'fulfilled' && wfRes.value?.workflow) setWf(wfRes.value.workflow)
      if (modelRes.status === 'fulfilled') setModels(modelRes.value?.models ?? [])
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId])

  const updateAgent = (idx: number, patch: Partial<WorkflowSettings['agents'][0]>) => {
    setWf(prev => ({ ...prev, agents: prev.agents.map((a, i) => i === idx ? { ...a, ...patch } : a) }))
  }

  const moveAgent = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= wf.agents.length) return
    const agents = [...wf.agents]
    const [m] = agents.splice(idx, 1)
    agents.splice(nextIdx, 0, m)
    setWf(prev => ({ ...prev, agents }))
  }

  const addAgent = () => {
    setWf(prev => ({
      ...prev,
      agents: [...prev.agents, { id: `agent-${prev.agents.length + 1}`, name: 'New Agent', role: 'analysis', model: models[0]?.id || 'minimax-portal/MiniMax-M2.5', description: 'Describe role' }],
    }))
  }

  const removeAgent = (idx: number) => {
    setWf(prev => ({ ...prev, agents: prev.agents.filter((_, i) => i !== idx) }))
  }

  const updateStep = (idx: number, patch: Partial<WorkflowSettings['steps'][0]>) => {
    setWf(prev => ({ ...prev, steps: prev.steps.map((s, i) => i === idx ? { ...s, ...patch } : s) }))
  }

  const addStep = () => {
    setWf(prev => ({
      ...prev,
      steps: [...prev.steps, { id: `step-${prev.steps.length + 1}`, agent: prev.agents[0]?.id || '', input: '' }],
    }))
  }

  const removeStep = (idx: number) => {
    setWf(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== idx) }))
  }

  const save = async () => {
    if (!wf.id.trim() || !wf.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        workflow: {
          ...wf,
          id: wf.id.trim(),
          name: wf.name.trim(),
          description: wf.description || 'Squad workflow',
        },
      }
      const res = await fetch('/api/workflow-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) onSaved()
    } catch {}
    setSaving(false)
  }

  const copyPrompt = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopiedPromptId(id)
    setTimeout(() => setCopiedPromptId(null), 1200)
  }

  if (loading) return <LobsterLoader label="Loading squad settings…" />

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="section-header">Workflow</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={wf.id} onChange={e => setWf(prev => ({ ...prev, id: e.target.value }))} placeholder="workflow id (e.g. dev-team)" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.68rem' }} />
            <input value={wf.name} onChange={e => setWf(prev => ({ ...prev, name: e.target.value }))} placeholder="Squad title" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.72rem' }} />
            <textarea value={wf.description} onChange={e => setWf(prev => ({ ...prev, description: e.target.value }))} placeholder="Description" rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.7rem', resize: 'vertical' }} />
          </div>
        </div>
      </div>

      <div className="section-header">Agents ({wf.agents.length})</div>
      <div style={{ margin: '0 8px' }}>
        {wf.agents.map((a, i) => (
          <div key={`${a.id}-${i}`} className="glass-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button onClick={() => moveAgent(i, -1)} style={{ ...topBtn, padding: '2px 7px', fontSize: '0.62rem', border: '1px solid var(--separator)', borderRadius: 6, background: 'var(--bg-tertiary)' }}>↑</button>
              <button onClick={() => moveAgent(i, 1)} style={{ ...topBtn, padding: '2px 7px', fontSize: '0.62rem', border: '1px solid var(--separator)', borderRadius: 6, background: 'var(--bg-tertiary)' }}>↓</button>
              <button onClick={() => removeAgent(i)} style={{ ...topBtn, padding: '2px 7px', fontSize: '0.62rem', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <input value={a.id} onChange={e => updateAgent(i, { id: e.target.value })} placeholder="agent id" style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.66rem' }} />
              <input value={a.name} onChange={e => updateAgent(i, { name: e.target.value })} placeholder="agent name" style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.7rem' }} />
              <input value={a.role} onChange={e => updateAgent(i, { role: e.target.value })} placeholder="role" style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.7rem' }} />
              <select value={a.model} onChange={e => updateAgent(i, { model: e.target.value })} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.66rem' }}>
                {[a.model, ...models.map(m => m.id)].filter(Boolean).filter((v, idx, arr) => arr.indexOf(v) === idx).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <textarea value={a.description} onChange={e => updateAgent(i, { description: e.target.value })} placeholder="description" rows={2} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.68rem' }} />
            </div>
          </div>
        ))}
        <button onClick={addAgent} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--separator-strong)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>+ Add agent</button>
      </div>

      <div className="section-header">Flow Steps ({wf.steps.length})</div>
      <div style={{ margin: '0 8px' }}>
        {wf.steps.map((st, i) => (
          <div key={`${st.id}-${i}`} className="glass-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <input value={st.id} onChange={e => updateStep(i, { id: e.target.value })} placeholder="step id" style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.66rem' }} />
              <select value={st.agent} onChange={e => updateStep(i, { agent: e.target.value })} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.68rem' }}>
                {wf.agents.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}
              </select>
              <textarea value={st.input} onChange={e => updateStep(i, { input: e.target.value })} placeholder="step prompt/input" rows={5} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.67rem', fontFamily: 'monospace' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => copyPrompt(st.id, st.input)} style={{ ...topBtn, padding: '3px 8px', fontSize: '0.62rem', border: '1px solid var(--separator)', borderRadius: 6, background: 'var(--bg-tertiary)' }}>{copiedPromptId === st.id ? 'Copied' : 'Copy prompt'}</button>
                <button onClick={() => removeStep(i)} style={{ ...topBtn, padding: '3px 8px', fontSize: '0.62rem', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addStep} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--separator-strong)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>+ Add step</button>
      </div>

      <div style={{ margin: '10px 8px 0' }}>
        <button onClick={save} disabled={saving} style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid var(--separator)', background: 'var(--accent)', color: '#fff', fontSize: '0.74rem', fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save squad workflow'}
        </button>
      </div>
    </div>
  )
}

// ─── Memory ─────────────────────────────────────────────
type MemoryDoc = { path: string; updatedAt: string; excerpt: string }

function MemoryPage() {
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<MemoryDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [fullByPath, setFullByPath] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = query.trim()
      const res = await fetch(`/api/memory${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      const data = await res.json()
      setDocs(data.docs ?? [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { load() }, [load])

  const toggle = async (path: string) => {
    if (expandedPath === path) {
      setExpandedPath(null)
      return
    }
    setExpandedPath(path)
    if (fullByPath[path] !== undefined) return

    try {
      const res = await fetch(`/api/memory?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      setFullByPath(prev => ({ ...prev, [path]: data.content || '' }))
    } catch {
      setFullByPath(prev => ({ ...prev, [path]: 'Failed to load file' }))
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ padding: '8px 10px' }}>
        <div className="flex items-center" style={{
          background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
          borderRadius: 10, padding: '8px 12px', gap: 8,
        }}>
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Search memory files…"
            style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', WebkitAppearance: 'none' }}
          />
          <button onClick={load} style={{ ...topBtn, padding: '2px 6px', fontSize: '0.68rem' }}>Go</button>
        </div>
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Loading memory…</div>}

      {!loading && (
        <div style={{ margin: '0 8px' }}>
          {docs.map((d, i) => {
            const expanded = expandedPath === d.path
            const fullText = fullByPath[d.path]
            return (
              <motion.div key={d.path} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5, cursor: 'pointer' }} onClick={() => toggle(d.path)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{d.path}</span>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{relativeTime(d.updatedAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{d.excerpt}</div>

                  <AnimatePresence>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                        style={{ overflow: 'hidden' }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <div style={{ marginTop: 8, border: '1px solid var(--separator)', borderRadius: 8, background: 'var(--bg-primary)', maxHeight: 320, overflowY: 'auto', padding: '9px 10px' }}>
                          <pre style={{ margin: 0, fontSize: '0.66rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {fullText ?? 'Loading full file…'}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
          {docs.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No memory docs found</div>}
        </div>
      )}
    </div>
  )
}

// ─── Timeline (Reports) ───────────────────────────────────────
type Report = {
  id: string
  source: string
  title: string
  text: string
  timestamp: string
  sessionId: string
}

function TimelinePage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/latest')
      const data = await res.json()
      setReports(Array.isArray(data) ? data : [])
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Loading reports…</div>}

      {!loading && (
        <div style={{ margin: '0 8px' }}>
          {reports.map((r, i) => {
            const expanded = expandedId === r.id
            const previewLines = r.text.split('\n').slice(0, 3).join('\n')
            return (
              <motion.div key={r.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                <div 
                  className="glass-card clickable" 
                  style={{ 
                    padding: '12px 14px', 
                    marginBottom: 6, 
                    cursor: 'pointer',
                    borderLeft: `3px solid ${getReportSourceColor(r.source)}`
                  }} 
                  onClick={() => toggle(r.id)}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <div style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      background: getReportSourceColor(r.source),
                      flexShrink: 0
                    }} />
                    <span style={{ 
                      fontSize: '0.65rem', 
                      fontWeight: 600, 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.07em', 
                      color: getReportSourceColor(r.source) 
                    }}>
                      {r.source}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                      {formatReportTimestamp(r.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {expanded ? (
                      renderSimpleMarkdown(r.text)
                    ) : (
                      <div style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        display: '-webkit-box', 
                        WebkitLineClamp: 3, 
                        WebkitBoxOrient: 'vertical' 
                      }}>
                        {previewLines}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
          {reports.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No reports found</div>}
        </div>
      )}
    </div>
  )
}

type ObservabilityPayload = {
  generatedAt: string
  clawmetry: {
    installed: boolean
    binaryPath: string | null
    running: boolean
    reachable: boolean
    url: string
  }
  summary: {
    totalSessions: number
    activeAgents: number
    totalMessages: number
    userMessages: number
    assistantMessages: number
    sessions24h: number
    messages24h: number
    userMessages24h: number
    assistantMessages24h: number
  }
  byAgent: Array<{
    agentId: string
    sessions: number
    sessions24h: number
    messages: number
    messages24h: number
    userMessages: number
    assistantMessages: number
    lastActiveAt: string | null
  }>
  recentSessions: Array<{
    sessionId: string
    agentId: string
    updatedAt: string
    messageCount: number
    userMessages: number
    assistantMessages: number
    lastMessageRole: string | null
    preview: string
  }>
}

function ObservabilityPage() {
  const [tab, setTab] = useState<'status' | 'overview' | 'sessions' | 'crons' | 'usage'>('status')
  const [data, setData] = useState<ObservabilityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null)

  // Embedded view data states
  const [overviewData, setOverviewData] = useState<any>(null)
  const [sessionsData, setSessionsData] = useState<any>(null)
  const [cronsData, setCronsData] = useState<any>(null)
  const [usageData, setUsageData] = useState<any>(null)
  const [embeddedLoading, setEmbeddedLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/observability', { cache: 'no-store' })
      const body = await res.json()
      if (res.ok) setData(body)
      else setData(null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadEmbedded = useCallback(async (target: 'overview' | 'sessions' | 'crons' | 'usage') => {
    setEmbeddedLoading(true)
    try {
      const res = await fetch(`/api/observability/proxy/${target}`, { cache: 'no-store' })
      const json = await res.json()
      if (target === 'overview') setOverviewData(json)
      if (target === 'sessions') setSessionsData(json)
      if (target === 'crons') setCronsData(json)
      if (target === 'usage') setUsageData(json)
    } catch {
      // silent fail
    } finally {
      setEmbeddedLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 15000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    if (tab !== 'status' && data?.clawmetry?.running) {
      loadEmbedded(tab)
    }
  }, [tab, data?.clawmetry?.running, loadEmbedded])

  const runAction = async (action: 'start' | 'stop') => {
    setBusy(action)
    try {
      await fetch('/api/observability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LobsterLoader label="Loading observability…" />

  const s = data?.summary

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: 'status', label: 'Status' },
    { key: 'overview', label: 'Overview' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'crons', label: 'Crons' },
    { key: 'usage', label: 'Usage' },
  ]

  const TabBar = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 0, margin: '8px 8px 10px' }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          style={{
            ...topBtn,
            padding: '6px 10px',
            fontSize: '0.72rem',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: tab === t.key ? 600 : 400,
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >{t.label}</button>
      ))}
    </div>
  )

  const StatCard = ({ title, value, sub }: { title: string; value: string | number; sub?: string }) => (
    <div className="glass-card" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  )

  const DataCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>{title}</div>
      {children}
    </div>
  )

  const ErrorCard = ({ error }: { error: string }) => (
    <div className="glass-card" style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: '0.78rem', borderColor: 'rgba(239,68,68,0.3)' }}>
      {error}
    </div>
  )

  return (
    <div style={{ paddingBottom: 24 }}>
      {TabBar}

      {tab === 'status' && (
        <>
          <div style={{ margin: '0 8px 10px' }}>
            <div className="glass-card" style={{ padding: '12px 14px' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <span className={`status-dot ${data?.clawmetry?.running ? 'green' : 'red'}`} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>ClawMetry</span>
                <span style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                  {data?.generatedAt ? `Updated ${relativeTime(data.generatedAt)}` : '—'}
                </span>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {data?.clawmetry?.running ? 'Running on localhost:8900' : 'Not running'}
                {data?.clawmetry?.installed ? '' : ' · not installed'}
              </div>

              <div className="flex items-center gap-2" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => runAction('start')}
                  disabled={busy !== null}
                  style={{ ...topBtn, padding: '5px 10px', fontSize: '0.7rem', border: '1px solid var(--separator)', borderRadius: 8 }}
                >
                  {busy === 'start' ? 'Starting…' : 'Start'}
                </button>
                <button
                  onClick={() => runAction('stop')}
                  disabled={busy !== null}
                  style={{ ...topBtn, padding: '5px 10px', fontSize: '0.7rem', border: '1px solid var(--separator)', borderRadius: 8 }}
                >
                  {busy === 'stop' ? 'Stopping…' : 'Stop'}
                </button>
              </div>
            </div>
          </div>

          <div className="section-header">24h Activity</div>
          <div style={{ margin: '0 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <StatCard title="Messages" value={s?.messages24h ?? 0} sub={`User ${s?.userMessages24h ?? 0} · Asst ${s?.assistantMessages24h ?? 0}`} />
            <StatCard title="Sessions" value={s?.sessions24h ?? 0} sub={`${s?.activeAgents ?? 0} active agents`} />
          </div>

          <div className="section-header">Top Agents</div>
          <div style={{ margin: '0 8px' }}>
            {(data?.byAgent ?? []).map((a, i) => (
              <motion.div key={a.agentId} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5 }}>
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{a.agentId}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>{relativeTime(a.lastActiveAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                    {a.messages24h} msgs / 24h · {a.sessions} sessions · U:{a.userMessages} A:{a.assistantMessages}
                  </div>
                </div>
              </motion.div>
            ))}
            {(data?.byAgent?.length ?? 0) === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No agent activity found</div>
            )}
          </div>

          <div className="section-header">Recent Sessions</div>
          <div style={{ margin: '0 8px' }}>
            {(data?.recentSessions ?? []).map((r, i) => (
              <motion.div key={`${r.agentId}:${r.sessionId}`} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5 }}>
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.agentId}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{relativeTime(r.updatedAt)}</span>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {r.messageCount} msgs · U:{r.userMessages} A:{r.assistantMessages}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                    {r.preview || 'No preview available'}
                  </div>
                </div>
              </motion.div>
            ))}
            {(data?.recentSessions?.length ?? 0) === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No recent sessions</div>
            )}
          </div>
        </>
      )}

      {tab === 'overview' && (
        <div style={{ margin: '0 8px' }}>
          {embeddedLoading && <LobsterLoader label="Loading overview…" />}
          {!embeddedLoading && !data?.clawmetry?.running && <ErrorCard error="ClawMetry is not running. Start it in the Status tab." />}
          {!embeddedLoading && data?.clawmetry?.running && overviewData && (
            <>
              {overviewData.error ? <ErrorCard error={overviewData.error} /> : (
                <>
                  <div className="section-header">System</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    <StatCard title="Model" value={overviewData.model ?? '—'} />
                    <StatCard title="Context Window" value={overviewData.contextWindow?.toLocaleString() ?? '—'} />
                    <StatCard title="Main Session Tokens" value={overviewData.mainTokens?.toLocaleString() ?? '—'} />
                    <StatCard title="Memory Files" value={overviewData.memoryCount ?? '—'} />
                  </div>
                  <DataCard title="Infrastructure">
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <div>Machine: {overviewData.infra?.machine ?? '—'}</div>
                      <div>Network: {overviewData.infra?.network ?? '—'}</div>
                      <div>Runtime: {overviewData.infra?.runtime ?? '—'}</div>
                      <div>Storage: {overviewData.infra?.storage ?? '—'}</div>
                    </div>
                  </DataCard>
                  {overviewData.system && (
                    <DataCard title="Health">
                      {(overviewData.system as any[]).map(([name, val, status]: any, i: number) => (
                        <div key={i} className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                          <span className={`status-dot ${status === 'green' ? 'green' : status === 'red' ? 'red' : 'yellow'}`} />
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{name}: {val}</span>
                        </div>
                      ))}
                    </DataCard>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div style={{ margin: '0 8px' }}>
          {embeddedLoading && <LobsterLoader label="Loading sessions…" />}
          {!embeddedLoading && !data?.clawmetry?.running && <ErrorCard error="ClawMetry is not running. Start it in the Status tab." />}
          {!embeddedLoading && data?.clawmetry?.running && sessionsData && (
            sessionsData.error ? <ErrorCard error={sessionsData.error} /> : (
              <>
                <div className="section-header">All Sessions</div>
                {(sessionsData.sessions ?? []).slice(0, 20).map((s: any, i: number) => (
                  <motion.div key={s.id ?? i} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                    <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5 }}>
                      <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{s.agentId ?? s.id ?? 'session'}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{relativeTime(s.updatedAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
                        {s.messageCount ?? 0} msgs · {s.toolCalls ?? 0} tools
                      </div>
                    </div>
                  </motion.div>
                ))}
                {(sessionsData.sessions?.length ?? 0) === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No sessions</div>
                )}
              </>
            )
          )}
        </div>
      )}

      {tab === 'crons' && (
        <div style={{ margin: '0 8px' }}>
          {embeddedLoading && <LobsterLoader label="Loading crons…" />}
          {!embeddedLoading && !data?.clawmetry?.running && <ErrorCard error="ClawMetry is not running. Start it in the Status tab." />}
          {!embeddedLoading && data?.clawmetry?.running && cronsData && (
            cronsData.error ? <ErrorCard error={cronsData.error} /> : (
              <>
                <div className="section-header">Cron Jobs</div>
                {(cronsData.crons ?? cronsData.jobs ?? []).map((c: any, i: number) => (
                  <motion.div key={c.id ?? i} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                    <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5 }}>
                      <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                        <span className={`status-dot ${c.enabled !== false ? 'green' : 'red'}`} />
                        <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{c.name ?? c.id ?? 'cron'}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{c.schedule ?? c.expr ?? ''}</span>
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
                        {c.enabled !== false ? 'Enabled' : 'Disabled'}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {(cronsData.crons?.length ?? cronsData.jobs?.length ?? 0) === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No cron jobs</div>
                )}
              </>
            )
          )}
        </div>
      )}

      {tab === 'usage' && (
        <div style={{ margin: '0 8px' }}>
          {embeddedLoading && <LobsterLoader label="Loading usage…" />}
          {!embeddedLoading && !data?.clawmetry?.running && <ErrorCard error="ClawMetry is not running. Start it in the Status tab." />}
          {!embeddedLoading && data?.clawmetry?.running && usageData && (
            usageData.error ? <ErrorCard error={usageData.error} /> : (
              <>
                <div className="section-header">Token Usage</div>
                <DataCard title="Today">
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <div>Input: {usageData.today?.inputTokens?.toLocaleString() ?? '—'}</div>
                    <div>Output: {usageData.today?.outputTokens?.toLocaleString() ?? '—'}</div>
                    <div>Total: {usageData.today?.totalTokens?.toLocaleString() ?? '—'}</div>
                  </div>
                </DataCard>
                {usageData.models && (
                  <DataCard title="By Model">
                    {(usageData.models as any[]).map((m: any, i: number) => (
                      <div key={i} className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, minWidth: 100 }}>{m.name ?? m.id ?? 'model'}</span>
                        <span style={{ fontSize: '0.64rem', color: 'var(--text-secondary)' }}>{m.tokens?.toLocaleString() ?? 0} tokens</span>
                      </div>
                    ))}
                  </DataCard>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Skill Graph ───────────────────────────────────────
type SkillGraphNode = { id: string; title: string; description: string; out: number; inbound: number }

function SkillGraphPage() {
  const [nodes, setNodes] = useState<SkillGraphNode[]>([])
  const [edges, setEdges] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [fullNodeById, setFullNodeById] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/skill-graph')
      .then(r => r.json())
      .then(data => {
        setNodes(data.nodes ?? [])
        setEdges(data.edgeCount ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (id: string) => {
    if (expandedNode === id) {
      setExpandedNode(null)
      return
    }
    setExpandedNode(id)
    if (fullNodeById[id] !== undefined) return

    try {
      const res = await fetch(`/api/skill-graph?id=${encodeURIComponent(id)}`)
      const data = await res.json()
      setFullNodeById(prev => ({ ...prev, [id]: data.content || '' }))
    } catch {
      setFullNodeById(prev => ({ ...prev, [id]: 'Failed to load node' }))
    }
  }

  if (loading) return <LobsterLoader label="Loading graph…" />

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="section-header">Graph Overview</div>
      <div style={{ margin: '0 8px' }}>
        <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-space-grotesk)' }}>{nodes.length}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Nodes</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-space-grotesk)' }}>{edges}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>Wiki Links</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-header">Nodes (tap to read)</div>
      <div style={{ margin: '0 8px' }}>
        {nodes.map((n, i) => {
          const expanded = expandedNode === n.id
          return (
            <motion.div key={n.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
              <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 5, cursor: 'pointer' }} onClick={() => toggle(n.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{n.title}</span>
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{n.out} out / {n.inbound} in</span>
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginBottom: 4 }}>{n.id}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{n.description || 'No description'}</div>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <div style={{ marginTop: 8, border: '1px solid var(--separator)', borderRadius: 8, background: 'var(--bg-primary)', maxHeight: 320, overflowY: 'auto', padding: '9px 10px' }}>
                        <pre style={{ margin: 0, fontSize: '0.66rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {fullNodeById[n.id] ?? 'Loading full node…'}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
        {nodes.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>No skill graph nodes yet</div>}
      </div>
    </div>
  )
}

// ─── Settings ───────────────────────────────────────────
function SettingsPage() {
  const { user: authUser, logout } = useAuth()
  const [userMd, setUserMd] = useState('')
  const [userMdOriginal, setUserMdOriginal] = useState('')
  const [loadingMd, setLoadingMd] = useState(true)
  const [savingMd, setSavingMd] = useState(false)
  const [savedMd, setSavedMd] = useState(false)
  const [editingMd, setEditingMd] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})

  // API keys state
  const [keys, setKeys] = useState<Array<{ id: string; label: string; provider: string; masked: string }>>([
    { id: '1', label: 'OpenAI', provider: 'openai', masked: '••••••••••••••hk4Q' },
    { id: '2', label: 'Anthropic', provider: 'anthropic', masked: '••••••••••••••x9mR' },
  ])

  useEffect(() => {
    fetch('/api/user-md')
      .then(r => r.json())
      .then(data => {
        if (data.content !== undefined) {
          setUserMd(data.content)
          setUserMdOriginal(data.content)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMd(false))
  }, [])

  const saveUserMd = async () => {
    setSavingMd(true)
    try {
      const res = await fetch('/api/user-md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMd }),
      })
      if (res.ok) {
        setUserMdOriginal(userMd)
        setSavedMd(true)
        setEditingMd(false)
        setTimeout(() => setSavedMd(false), 2000)
      }
    } catch {}
    setSavingMd(false)
  }

  const hasChanges = userMd !== userMdOriginal

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Account */}
      <div className="section-header">Account</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '2px 0', marginBottom: 6 }}>
            {/* Profile */}
            <div style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: '1px solid var(--separator)',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.2))',
                border: '1px solid rgba(59,130,246,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User2 size={18} style={{ color: '#60a5fa' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{authUser.name || authUser.email?.split('@')[0] || 'User'}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{authUser.email || 'Not logged in'}</div>
              </div>
              <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
            </div>

            {/* Subscription */}
            <div style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--separator)',
            }}>
              <CreditCard size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>Subscription</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>Manage billing via Stripe</div>
              </div>
              <span style={{
                fontSize: '0.6rem', fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                background: 'rgba(16,185,129,0.12)', color: '#10b981',
              }}>Pro</span>
              <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
            </div>

            {/* Login / Auth */}
            <div style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Shield size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>Login & Security</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>Password, 2FA, sessions</div>
              </div>
              <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* API Keys & OAuth */}
      <div className="section-header">API Keys & Tokens</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '2px 0', marginBottom: 6 }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--separator)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Key size={13} style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Bring your own keys. Used for LLM providers and external integrations.
              </span>
            </div>
            {keys.map((k, ki) => (
              <div key={k.id} style={{
                padding: '11px 14px',
                borderBottom: ki < keys.length - 1 ? '1px solid var(--separator)' : 'none',
              }}>
                {editingKeyId === k.id ? (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 500, marginBottom: 6 }}>{k.label}</div>
                    <input
                      type="password"
                      placeholder={`Enter ${k.label} API key`}
                      value={keyValues[k.id] || ''}
                      onChange={e => setKeyValues(prev => ({ ...prev, [k.id]: e.target.value }))}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: '0.72rem',
                        background: 'var(--bg-primary)', border: '1px solid var(--separator-strong)',
                        color: 'var(--text-primary)', outline: 'none', marginBottom: 8,
                        fontFamily: 'monospace',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={async () => {
                        // Save key
                        await fetch('/api/keys', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ provider: k.provider, key: keyValues[k.id] }),
                        })
                        setEditingKeyId(null)
                        setKeyValues(prev => ({ ...prev, [k.id]: '' }))
                      }} style={{
                        fontSize: '0.64rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                        background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
                      }}>Save</button>
                      <button onClick={() => { setEditingKeyId(null); setKeyValues(prev => ({ ...prev, [k.id]: '' })) }} style={{
                        fontSize: '0.64rem', padding: '4px 10px', borderRadius: 6,
                        background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                      }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 500 }}>{k.label}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: 2 }}>{k.masked}</div>
                    </div>
                    <button onClick={() => setEditingKeyId(k.id)} style={{
                      fontSize: '0.64rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                      background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}>Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Add key button */}
        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
          <button style={{
            width: '100%', padding: '10px', marginBottom: 6, borderRadius: 10,
            background: 'var(--bg-tertiary)', border: '1px dashed var(--separator-strong)',
            color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'var(--font-jakarta), sans-serif',
          }}>
            <Plus size={14} /> Add API Key or OAuth Token
          </button>
        </motion.div>
      </div>

      {/* USER.md Editor */}
      <div className="section-header">User Profile (USER.md)</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
            {loadingMd ? (
              <div style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-tertiary)', padding: 8 }}>Loading…</div>
            ) : !editingMd ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>USER.md</span>
                  </div>
                  <button onClick={() => setEditingMd(true)} style={{
                    fontSize: '0.64rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                    background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', color: 'var(--accent)',
                    cursor: 'pointer',
                  }}>Edit</button>
                </div>
                <pre style={{
                  margin: 0, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg-primary)', border: '1px solid var(--separator)',
                  fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto',
                  fontFamily: 'monospace',
                }}>
                  {userMd || '(empty)'}
                </pre>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Editing USER.md</span>
                  </div>
                  {savedMd && (
                    <span style={{ fontSize: '0.64rem', color: '#10b981', fontWeight: 600 }}>✓ Saved</span>
                  )}
                </div>
                <textarea
                  value={userMd}
                  onChange={e => setUserMd(e.target.value)}
                  rows={14}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    background: 'var(--bg-primary)', border: '1px solid var(--separator-strong)',
                    borderRadius: 8, padding: '10px 12px', fontSize: '0.7rem',
                    color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace',
                    lineHeight: 1.55,
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={saveUserMd} disabled={savingMd || !hasChanges} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8,
                    fontSize: '0.7rem', fontWeight: 600,
                    background: hasChanges ? 'var(--accent)' : 'var(--bg-tertiary)',
                    border: 'none', color: hasChanges ? '#fff' : 'var(--text-tertiary)',
                    cursor: hasChanges ? 'pointer' : 'default',
                    fontFamily: 'var(--font-jakarta), sans-serif',
                  }}>
                    <Save size={12} /> {savingMd ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingMd(false); setUserMd(userMdOriginal) }} style={{
                    padding: '6px 14px', borderRadius: 8, fontSize: '0.7rem',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--separator)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    fontFamily: 'var(--font-jakarta), sans-serif',
                  }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Sign Out */}
      <div style={{ margin: '0 8px', marginTop: 12 }}>
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
          <button onClick={logout} style={{
            width: '100%', padding: '13px', borderRadius: 12,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-jakarta), sans-serif',
          }}>
            <LogOut size={15} /> Sign Out
          </button>
        </motion.div>
      </div>
    </div>
  )
}

// ─── KPIs ───────────────────────────────────────────────
type ProviderStatus = { id: string; provider: string; lastUsed: string | null; errorCount: number; failureCounts: Record<string, number>; cooldownUntil: string | null; cooldownRemaining: string | null; status: 'healthy' | 'cooldown' | 'error' | 'dead' }
type ProviderUsage = {
  provider: string
  displayName: string
  plan: string | null
  error?: string
  buckets: Array<{ label: string; usedPercent: number; remainingPercent: number; resetAt: string | null }>
}

type BucketRange = 'today' | '24h' | 'wtd' | 'mtd'

type ModelUsageRow = {
  key: string
  label: string
  count: number
  tokens: Record<BucketRange, number>
}

function matchUsageProvider(p: ProviderStatus, usageProviders: ProviderUsage[]): ProviderUsage | undefined {
  const id = p.provider.toLowerCase()
  return usageProviders.find((u) => {
    const x = u.provider.toLowerCase()
    return x === id || x.startsWith(id) || id.startsWith(x)
  })
}

function providerPriceHint(provider: string): string {
  const p = provider.toLowerCase()
  if (p.includes('openai')) return 'gpt-5.3-codex ≈ $2.50 in / $10 out per 1M tokens'
  if (p.includes('anthropic')) return 'claude-sonnet-4.5 ≈ $3 in / $15 out per 1M tokens'
  if (p.includes('google')) return 'gemini-2.5-pro ≈ $1.25 in / $10 out per 1M tokens'
  if (p.includes('minimax')) return 'minimax-m2.5 ≈ $0.50 in / $2 out per 1M tokens'
  if (p.includes('openrouter')) return 'Pricing depends on routed model'
  return 'Pricing depends on selected model/profile'
}

function providerLimitHint(u?: ProviderUsage): string {
  if (!u) return 'No enforcement windows reported by provider'
  if (u.error) return 'Provider returned usage error'
  if (!u.buckets.length) return 'Provider does not expose quota windows'
  return `Windows: ${u.buckets.map((b) => b.label).join(', ')}`
}

function fmtTokens(n: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function KPIsPage() {
  const [gateway, setGateway] = useState<GatewayStatus | null>(null)
  const [cronStats, setCronStats] = useState<{ active: number; error: number; disabled: number; total: number } | null>(null)
  const [agentCount, setAgentCount] = useState(0)
  const [models, setModels] = useState<ModelUsageRow[]>([])
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [openaiNote, setOpenaiNote] = useState<string | null>(null)
  const [usageProviders, setUsageProviders] = useState<ProviderUsage[]>([])
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const [bucketRange, setBucketRange] = useState<BucketRange>('24h')
  const [kpiLoading, setKpiLoading] = useState(true)

  useEffect(() => {
    setKpiLoading(true)
    Promise.allSettled([
      fetch('/api/gateway-status').then(r => r.json()),
      fetch('/api/cron-jobs').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/provider-status').then(r => r.json()),
      fetch('/api/model-usage').then(r => r.json()),
    ]).then(([gwRes, cronRes, agentRes, provRes, usageRes]) => {
      if (gwRes.status === 'fulfilled') setGateway(gwRes.value)

      const modelCounts = new Map<string, number>()
      const modelLabels = new Map<string, string>()
      const modelTokens = new Map<string, Record<BucketRange, number>>()

      if (cronRes.status === 'fulfilled') {
        const jobs = cronRes.value?.jobs ?? []
        setCronStats({
          active: jobs.filter((j: CronJob) => j.status === 'active').length,
          error: jobs.filter((j: CronJob) => j.status === 'error').length,
          disabled: jobs.filter((j: CronJob) => j.status === 'disabled').length,
          total: jobs.length,
        })

        for (const j of jobs) {
          const label = shortModel((j as CronJob).model || 'default')
          const key = label.toLowerCase()
          modelCounts.set(key, (modelCounts.get(key) || 0) + 1)
          if (!modelLabels.has(key)) modelLabels.set(key, label)
        }
      }

      if (agentRes.status === 'fulfilled') {
        const agents = agentRes.value?.agents ?? []
        setAgentCount(agents.length)
        for (const a of agents) {
          const label = shortModel((a as AgentInfo).model || 'default')
          const key = label.toLowerCase()
          modelCounts.set(key, (modelCounts.get(key) || 0) + 1)
          if (!modelLabels.has(key)) modelLabels.set(key, label)
        }
      }

      if (usageRes.status === 'fulfilled') {
        for (const row of usageRes.value?.models ?? []) {
          const label = shortModel(row.model || 'unknown')
          const key = label.toLowerCase()
          const prev = modelTokens.get(key) || { today: 0, '24h': 0, wtd: 0, mtd: 0 }
          modelTokens.set(key, {
            today: prev.today + Number(row.tokens?.today || 0),
            '24h': prev['24h'] + Number(row.tokens?.['24h'] || 0),
            wtd: prev.wtd + Number(row.tokens?.wtd || 0),
            mtd: prev.mtd + Number(row.tokens?.mtd || 0),
          })
          if (!modelLabels.has(key)) modelLabels.set(key, label)
        }
      }

      const allKeys = new Set<string>([...Array.from(modelCounts.keys()), ...Array.from(modelTokens.keys())])
      setModels(
        Array.from(allKeys)
          .map((key) => ({
            key,
            label: modelLabels.get(key) || key,
            count: modelCounts.get(key) || 0,
            tokens: modelTokens.get(key) || { today: 0, '24h': 0, wtd: 0, mtd: 0 },
          }))
          .sort((a, b) => (b.tokens.mtd || 0) - (a.tokens.mtd || 0) || b.count - a.count)
      )

      if (provRes.status === 'fulfilled') {
        const nextProviders = provRes.value.providers ?? []
        const nextUsageProviders = provRes.value.usageProviders ?? []

        setProviders(nextProviders)
        setOpenaiNote(provRes.value.openaiCooldownNote ?? null)

        // Keep last known usage windows if this refresh returns empty.
        setUsageProviders((prev) => nextUsageProviders.length > 0 ? nextUsageProviders : prev)

        // Expand OpenAI + Google cards by default.
        setExpandedProviders((prev) => {
          const seeded = { ...prev }
          const probe = [...nextProviders, ...nextUsageProviders.map((u: any) => ({ id: u.provider, provider: u.provider }))]
          for (const p of probe) {
            const id = String(p?.id || p?.provider || '')
            const low = id.toLowerCase()
            if (low.includes('openai') || low.includes('google')) {
              if (typeof seeded[id] !== 'boolean') seeded[id] = true
            }
          }
          return seeded
        })
      }
    }).finally(() => setKpiLoading(false))
  }, [])

  const isOnline = gateway?.status === 'online'
  const statusColors = { healthy: '#10b981', error: '#f59e0b', cooldown: '#3b82f6', dead: '#ef4444' }
  const statusLabels = { healthy: 'Healthy', error: 'Errors', cooldown: 'Cooldown', dead: 'Depleted' }
  const maxTokens = Math.max(1, ...models.map((m) => m.tokens[bucketRange] || 0))
  const maxCount = Math.max(1, ...models.map((m) => m.count || 0))

  const providerMap = new Map<string, ProviderStatus>()
  for (const p of providers) providerMap.set(p.provider, p)

  const usageChartProviders: ProviderStatus[] = Array.from(new Set([
    ...providers.map((p) => p.provider),
    ...usageProviders.map((u) => u.provider),
  ]))
    .filter((id) => {
      const low = id.toLowerCase()
      return low.includes('openai') || low.includes('google')
    })
    .map((id) => providerMap.get(id) || {
      id,
      provider: id,
      lastUsed: null,
      errorCount: 0,
      failureCounts: {},
      cooldownUntil: null,
      cooldownRemaining: null,
      status: 'healthy' as const,
    })

  const topModelPrices = [
    { model: 'claude-opus-4-6', provider: 'Anthropic', inPrice: 15, outPrice: 75 },
    { model: 'claude-sonnet-4.5', provider: 'Anthropic', inPrice: 3, outPrice: 15 },
    { model: 'gpt-5.3-codex', provider: 'OpenAI', inPrice: 2.5, outPrice: 10 },
    { model: 'gemini-2.5-pro', provider: 'Google', inPrice: 1.25, outPrice: 10 },
    { model: 'gpt-5.2', provider: 'OpenAI', inPrice: 1.25, outPrice: 5 },
    { model: 'gemini-3-pro-high', provider: 'Google', inPrice: 1.1, outPrice: 5 },
    { model: 'minimax-m2.5', provider: 'MiniMax', inPrice: 0.5, outPrice: 2 },
  ]
    .sort((a, b) => b.outPrice - a.outPrice)
    .slice(0, 5)

  return (
    <div style={{ paddingBottom: 24 }}>
      {kpiLoading && (
        <div style={{ margin: '0 8px 6px' }}>
          <LobsterLoader label="Refreshing KPI feeds…" minHeight={120} />
        </div>
      )}

      <div className="section-header">System</div>
      <div style={{ margin: '0 8px' }}>
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
          <div className="glass-card" style={{ padding: '14px', marginBottom: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Gateway', value: isOnline ? '●' : '○', color: isOnline ? 'var(--accent)' : '#ef4444' },
                { label: 'Agents', value: String(agentCount), color: 'var(--text-primary)' },
                { label: 'Scheduled', value: String(cronStats?.total ?? '—'), color: 'var(--text-primary)' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-space-grotesk)', color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {cronStats && (
        <>
          <div className="section-header">Scheduled Health</div>
          <div style={{ margin: '0 8px' }}>
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
              <div className="glass-card" style={{ padding: '12px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'Active', value: cronStats.active, color: '#10b981' },
                    { label: 'Error', value: cronStats.error, color: '#ef4444' },
                    { label: 'Disabled', value: cronStats.disabled, color: '#6b7280' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-space-grotesk)', color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                  {cronStats.active > 0 && <div style={{ width: `${(cronStats.active / Math.max(1, cronStats.total)) * 100}%`, background: '#10b981' }} />}
                  {cronStats.error > 0 && <div style={{ width: `${(cronStats.error / Math.max(1, cronStats.total)) * 100}%`, background: '#ef4444' }} />}
                  {cronStats.disabled > 0 && <div style={{ width: `${(cronStats.disabled / Math.max(1, cronStats.total)) * 100}%`, background: '#6b7280' }} />}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}

      <div className="section-header">Provider Status</div>
      <div style={{ margin: '0 8px' }}>
        {openaiNote && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <div style={{
              padding: '8px 12px', marginBottom: 6, borderRadius: 8,
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
              fontSize: '0.68rem', color: '#60a5fa', lineHeight: 1.4,
            }}>
              ⏸ {openaiNote}
            </div>
          </motion.div>
        )}

        {usageChartProviders.length === 0 && (
          kpiLoading
            ? <LobsterLoader label="Loading OpenAI/Google windows…" minHeight={120} />
            : (
              <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 6 }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)' }}>
                  No OpenAI/Google usage windows reported yet.
                </div>
              </div>
            )
        )}

        {usageChartProviders.map((p, i) => {
          const expanded = !!expandedProviders[p.id]
          const u = matchUsageProvider(p, usageProviders)
          const buckets = u?.buckets || []

          return (
            <motion.div key={p.id} custom={i + 3} variants={fadeUp} initial="hidden" animate="visible">
              <div className="glass-card" style={{ padding: '10px 13px', marginBottom: 5, cursor: 'pointer' }} onClick={() => setExpandedProviders((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-dot ${p.status === 'healthy' ? 'green' : p.status === 'dead' ? 'red' : 'yellow'}`} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1 }}>{p.provider}</span>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                    background: `${statusColors[p.status]}15`, color: statusColors[p.status],
                    border: `1px solid ${statusColors[p.status]}30`,
                  }}>{statusLabels[p.status]}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, paddingLeft: 14, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>Last: {p.lastUsed ? relativeTime(p.lastUsed) : 'never'}</span>
                  {p.errorCount > 0 && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>{p.errorCount} errors</span>}
                  {p.cooldownRemaining && <span style={{ fontSize: '0.6rem', color: '#3b82f6' }}>⏱ {p.cooldownRemaining} left</span>}
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)' }}>{expanded ? 'Tap to collapse' : 'Tap to expand'}</span>
                </div>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }}
                      style={{ overflow: 'hidden' }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--separator)' }}>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                          {u?.displayName || p.provider}{u?.plan ? ` · ${u.plan}` : ''}
                        </div>

                        {u?.error && (
                          <div style={{
                            padding: '6px 8px', borderRadius: 7, marginBottom: 8,
                            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                            color: '#f59e0b', fontSize: '0.62rem', lineHeight: 1.4,
                          }}>
                            Usage window error: {u.error}
                          </div>
                        )}

                        {buckets.map((b) => (
                          <div key={`${p.id}-${b.label}`} style={{ marginBottom: 9 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: '0.66rem', color: 'var(--text-primary)', fontWeight: 600 }}>{b.label}</span>
                              <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>
                                {b.usedPercent}% used · {b.remainingPercent}% left{b.resetAt ? ` · resets ${relativeTime(b.resetAt)}` : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                              <div style={{ width: `${b.usedPercent}%`, transition: 'width 240ms ease', background: '#ef4444' }} />
                              <div style={{ width: `${b.remainingPercent}%`, transition: 'width 240ms ease', background: '#10b981' }} />
                            </div>
                          </div>
                        ))}

                        {buckets.length === 0 && (
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                            No provider usage windows available.
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                            Limits: <span style={{ color: 'var(--text-tertiary)' }}>{providerLimitHint(u)}</span>
                          </div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                            Model prices: <span style={{ color: 'var(--text-tertiary)' }}>{providerPriceHint(p.provider)}</span>
                          </div>
                          {Object.keys(p.failureCounts).length > 0 && (
                            <div style={{ fontSize: '0.62rem', color: '#ef4444' }}>
                              Errors: {Object.entries(p.failureCounts).map(([k, v]) => `${k}:${v}`).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}

        {providers.filter((p) => {
          const low = p.provider.toLowerCase()
          return !low.includes('openai') && !low.includes('google')
        }).map((p, i) => (
          <motion.div key={p.id} custom={i + usageChartProviders.length + 3} variants={fadeUp} initial="hidden" animate="visible">
            <div className="glass-card" style={{ padding: '10px 13px', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status-dot ${p.status === 'healthy' ? 'green' : p.status === 'dead' ? 'red' : 'yellow'}`} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1 }}>{p.provider}</span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                  background: `${statusColors[p.status]}15`, color: statusColors[p.status],
                  border: `1px solid ${statusColors[p.status]}30`,
                }}>{statusLabels[p.status]}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, paddingLeft: 14, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>Last: {p.lastUsed ? relativeTime(p.lastUsed) : 'never'}</span>
                {p.errorCount > 0 && <span style={{ fontSize: '0.6rem', color: '#ef4444' }}>{p.errorCount} errors</span>}
                {p.cooldownRemaining && <span style={{ fontSize: '0.6rem', color: '#3b82f6' }}>⏱ {p.cooldownRemaining} left</span>}
              </div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--separator)', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                Model prices: <span style={{ color: 'var(--text-tertiary)' }}>{providerPriceHint(p.provider)}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="section-header">Top Model Pricing (Out / 1M)</div>
      <div style={{ margin: '0 8px 8px' }}>
        {topModelPrices.map((m, i) => (
          <motion.div key={m.model} custom={i + usageChartProviders.length + 3} variants={fadeUp} initial="hidden" animate="visible">
            <div className="glass-card" style={{ padding: '9px 12px', marginBottom: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)' }}>{m.provider}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.66rem', color: '#fca5a5', fontWeight: 700 }}>${m.outPrice.toFixed(2)} out</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)' }}>${m.inPrice.toFixed(2)} in</div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="section-header">Model Usage</div>
      <div style={{ margin: '0 8px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {([
            { key: 'today', label: 'Today' },
            { key: '24h', label: 'Last 24h' },
            { key: 'wtd', label: 'WTD' },
            { key: 'mtd', label: 'MTD' },
          ] as const).map(b => (
            <button
              key={b.key}
              onClick={() => setBucketRange(b.key)}
              style={{
                ...topBtn,
                padding: '4px 10px',
                fontSize: '0.62rem',
                borderRadius: 999,
                border: '1px solid var(--separator)',
                background: bucketRange === b.key ? 'rgba(59,130,246,0.14)' : 'var(--bg-tertiary)',
                color: bucketRange === b.key ? '#60a5fa' : 'var(--text-secondary)',
              }}
            >{b.label}</button>
          ))}
        </div>

        <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
          Tokens ({bucketRange.toUpperCase()}) + config usage count (agents + scheduled jobs).
        </div>

        {models.length === 0 && (
          kpiLoading
            ? <LobsterLoader label="Loading model usage…" minHeight={140} />
            : <div style={{ fontSize: '0.66rem', color: 'var(--text-tertiary)', padding: '8px 2px 10px' }}>No model usage yet.</div>
        )}

        {models.map((m, i) => {
          const tokenValue = Number(m.tokens[bucketRange] || 0)
          const tokenPct = Math.min(100, (tokenValue / maxTokens) * 100)
          const countPct = Math.min(100, (m.count / maxCount) * 100)
          return (
            <motion.div key={m.key} custom={i + usageChartProviders.length + 7} variants={fadeUp} initial="hidden" animate="visible">
              <div className="glass-card" style={{ padding: '9px 13px', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {fmtTokens(tokenValue)} tok · {m.count} cfg
                  </span>
                </div>

                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: '0.56rem', color: '#93c5fd', marginBottom: 3 }}>Tokens</div>
                  <div style={{ width: '100%', height: 6, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ width: `${tokenPct}%`, height: '100%', background: '#60a5fa', transition: 'width 240ms ease' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.56rem', color: '#a3a3a3', marginBottom: 3 }}>Config count</div>
                  <div style={{ width: '100%', height: 6, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ width: `${countPct}%`, height: '100%', background: '#6b7280', transition: 'width 240ms ease' }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
