import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export const DEFAULT_TOPIC_MAP: Record<string, string> = {
  '1': 'general',
  '5': 'morning-brief',
  '6': 'kb-drops',
  '7': 'clawpanel',
  '8': 'infra',
  '9': 'authority-engine',
  '10': 'job-search',
  '11': 'music-promo',
  '12': 'content-pipeline',
  '13': 'crm',
  '14': 'social-research',
  '15': 'zeug-analytics',
  '26': 'forge',
  '27': 'minerva',
  '205': 'veles',
}

export type ChannelLink = {
  channel: string
  sessionId?: string
  telegram?: {
    topicId?: string
    threadId?: string
    chatId?: string
  }
  createdAt?: string
  updatedAt: string
}

type LinksFile = {
  version: number
  updatedAt: string
  channels: Record<string, ChannelLink>
}

const LINKS_FILE = join(homedir(), '.openclaw', 'workspace', 'todo', 'channel-links.json')

function defaultLinksState(): LinksFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    channels: {},
  }
}

function normalizeTopicId(topicId?: string | null): string | undefined {
  const v = String(topicId || '').trim()
  return v ? v : undefined
}

function defaultLinkForChannel(channel: string): ChannelLink | null {
  const topicEntry = Object.entries(DEFAULT_TOPIC_MAP).find(([, mappedChannel]) => mappedChannel === channel)
  if (!topicEntry) return null
  const [topicId] = topicEntry
  const now = new Date().toISOString()
  return {
    channel,
    telegram: {
      topicId,
      threadId: topicId,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export async function readChannelLinksFile(): Promise<LinksFile> {
  try {
    const raw = await readFile(LINKS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultLinksState()
    return {
      version: Number(parsed.version || 1),
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      channels: typeof parsed.channels === 'object' && parsed.channels ? parsed.channels : {},
    }
  } catch {
    return defaultLinksState()
  }
}

export async function writeChannelLinksFile(state: LinksFile): Promise<void> {
  await mkdir(join(homedir(), '.openclaw', 'workspace', 'todo'), { recursive: true })
  await writeFile(LINKS_FILE, JSON.stringify(state, null, 2), 'utf-8')
}

export async function getAllChannelLinks(opts?: { includeDefaults?: boolean }): Promise<Record<string, ChannelLink>> {
  const includeDefaults = opts?.includeDefaults !== false
  const state = await readChannelLinksFile()
  const result: Record<string, ChannelLink> = { ...state.channels }

  if (!includeDefaults) return result

  for (const [, channel] of Object.entries(DEFAULT_TOPIC_MAP)) {
    if (!result[channel]) {
      const fallback = defaultLinkForChannel(channel)
      if (fallback) result[channel] = fallback
    }
  }

  return result
}

export async function getChannelLink(channel: string, opts?: { includeDefault?: boolean }): Promise<ChannelLink | null> {
  const includeDefault = opts?.includeDefault !== false
  const state = await readChannelLinksFile()
  const existing = state.channels[channel]
  if (existing) return existing
  if (!includeDefault) return null
  return defaultLinkForChannel(channel)
}

export async function upsertChannelLink(input: {
  channel: string
  sessionId?: string
  telegramTopicId?: string
  telegramThreadId?: string
  telegramChatId?: string
}): Promise<ChannelLink> {
  const channel = String(input.channel || '').trim()
  if (!channel) throw new Error('channel is required')

  const state = await readChannelLinksFile()
  const now = new Date().toISOString()
  const prev = state.channels[channel] || defaultLinkForChannel(channel) || { channel, createdAt: now, updatedAt: now }

  const next: ChannelLink = {
    channel,
    sessionId: input.sessionId || prev.sessionId,
    telegram: {
      topicId: normalizeTopicId(input.telegramTopicId) ?? prev.telegram?.topicId,
      threadId: normalizeTopicId(input.telegramThreadId) ?? prev.telegram?.threadId,
      chatId: normalizeTopicId(input.telegramChatId) ?? prev.telegram?.chatId,
    },
    createdAt: prev.createdAt || now,
    updatedAt: now,
  }

  if (!next.telegram?.topicId && !next.telegram?.threadId && !next.telegram?.chatId) {
    delete next.telegram
  }

  state.channels[channel] = next
  state.updatedAt = now
  await writeChannelLinksFile(state)
  return next
}
