import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function execOpenClaw(args: string[], timeout = 15000) {
  try {
    // Prefer absolute path to avoid PATH drift in hosted environments.
    return await execFileAsync('node', ['/usr/lib/node_modules/openclaw/openclaw.mjs', ...args], {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    })
  } catch {
    return await execFileAsync('openclaw', args, { timeout, maxBuffer: 2 * 1024 * 1024 })
  }
}

const CACHE_TTL_MS = 20_000
let cache: { ts: number; payload: any } | null = null
const USAGE_CACHE_FILE = join(homedir(), '.openclaw', 'workspace', 'memory', 'provider-usage-cache.json')

interface ProviderStatus {
  id: string
  provider: string
  lastUsed: string | null
  errorCount: number
  failureCounts: Record<string, number>
  cooldownUntil: string | null
  cooldownRemaining: string | null
  status: 'healthy' | 'cooldown' | 'error' | 'dead'
}

interface UsageBucket {
  label: string
  usedPercent: number
  remainingPercent: number
  resetAt: string | null
}

interface UsageProvider {
  provider: string
  displayName: string
  plan: string | null
  error?: string
  buckets: UsageBucket[]
}

type Aggregated = {
  lastUsed: number
  errorCount: number
  failureCounts: Record<string, number>
  cooldownUntil: number
  lastFailureAt: number
}

function providerFromProfileId(profileId: string): string {
  return profileId.includes(':') ? profileId.split(':')[0] : profileId
}

function mergeStats(into: Aggregated, from: Partial<Aggregated>) {
  into.lastUsed = Math.max(into.lastUsed, from.lastUsed || 0)
  into.errorCount = Math.max(into.errorCount, from.errorCount || 0)
  into.cooldownUntil = Math.max(into.cooldownUntil, from.cooldownUntil || 0)
  into.lastFailureAt = Math.max(into.lastFailureAt, from.lastFailureAt || 0)

  for (const [k, v] of Object.entries(from.failureCounts || {})) {
    into.failureCounts[k] = Math.max(into.failureCounts[k] || 0, v)
  }
}

function emptyAgg(): Aggregated {
  return {
    lastUsed: 0,
    errorCount: 0,
    failureCounts: {},
    cooldownUntil: 0,
    lastFailureAt: 0,
  }
}

async function readUsageCache(): Promise<{ usageProviders: UsageProvider[]; openaiUsage: UsageProvider | null } | null> {
  try {
    const raw = await readFile(USAGE_CACHE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    const usageProviders = Array.isArray(parsed?.usageProviders) ? parsed.usageProviders : []
    const openaiUsage = parsed?.openaiUsage ?? null
    if (!usageProviders.length && !openaiUsage) return null
    return { usageProviders, openaiUsage }
  } catch {
    return null
  }
}

async function writeUsageCache(usageProviders: UsageProvider[], openaiUsage: UsageProvider | null) {
  try {
    await mkdir(join(homedir(), '.openclaw', 'workspace', 'memory'), { recursive: true })
    await writeFile(USAGE_CACHE_FILE, JSON.stringify({
      ts: Date.now(),
      usageProviders,
      openaiUsage,
    }), 'utf-8')
  } catch {}
}

export async function GET() {
  try {
    if (cache && (Date.now() - cache.ts) < CACHE_TTL_MS) {
      return Response.json(cache.payload)
    }

    const home = homedir()
    const agentsDir = join(home, '.openclaw', 'agents')

    const profileStats = new Map<string, Aggregated>()
    const configuredProfiles = new Set<string>()

    // 1) Collect configured profiles from openclaw.json so providers with 0 usage still appear.
    try {
      const cfgRaw = await readFile(join(home, '.openclaw', 'openclaw.json'), 'utf-8')
      const cfg = JSON.parse(cfgRaw)
      const profiles = cfg?.auth?.profiles ?? {}
      for (const profileId of Object.keys(profiles)) configuredProfiles.add(profileId)
    } catch {}

    // 2) Aggregate usage stats from all agents.
    const entries = await readdir(agentsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const raw = await readFile(join(agentsDir, entry.name, 'agent', 'auth-profiles.json'), 'utf-8')
        const data = JSON.parse(raw)
        const stats = data.usageStats || {}
        for (const [profileId, s] of Object.entries(stats)) {
          const stat = s as Record<string, unknown>
          const existing = profileStats.get(profileId) || emptyAgg()
          mergeStats(existing, {
            lastUsed: (stat.lastUsed as number) || 0,
            errorCount: (stat.errorCount as number) || 0,
            failureCounts: (stat.failureCounts as Record<string, number>) || {},
            cooldownUntil: (stat.cooldownUntil as number) || 0,
            lastFailureAt: (stat.lastFailureAt as number) || 0,
          })
          profileStats.set(profileId, existing)
          configuredProfiles.add(profileId)
        }
      } catch {}
    }

    // 3) Collapse profile-level stats to provider-level cards.
    const providerAgg = new Map<string, Aggregated>()
    for (const profileId of Array.from(configuredProfiles)) {
      const provider = providerFromProfileId(profileId)
      if (!providerAgg.has(provider)) providerAgg.set(provider, emptyAgg())

      const stat = profileStats.get(profileId)
      if (stat) mergeStats(providerAgg.get(provider)!, stat)
    }

    const now = Date.now()
    const providers: ProviderStatus[] = Array.from(providerAgg.entries()).map(([provider, s]) => {
      const inCooldown = s.cooldownUntil > now
      const remainMs = inCooldown ? s.cooldownUntil - now : 0
      const remainStr = inCooldown ? formatDuration(remainMs) : null

      let status: ProviderStatus['status'] = 'healthy'
      if (inCooldown) status = 'cooldown'
      else if (s.errorCount >= 10) status = 'dead'
      else if (s.errorCount > 0) status = 'error'

      return {
        id: provider,
        provider,
        lastUsed: s.lastUsed ? new Date(s.lastUsed).toISOString() : null,
        errorCount: s.errorCount,
        failureCounts: s.failureCounts,
        cooldownUntil: s.cooldownUntil ? new Date(s.cooldownUntil).toISOString() : null,
        cooldownRemaining: remainStr,
        status,
      }
    })

    // Most problematic first.
    providers.sort((a, b) => {
      const order = { dead: 0, cooldown: 1, error: 2, healthy: 3 }
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
      return a.provider.localeCompare(b.provider)
    })

    // Also check the switch-back cron for OpenAI cooldown info
    let openaiCooldownNote: string | null = null
    try {
      const jobsRaw = await readFile(join(home, '.openclaw', 'cron', 'jobs.json'), 'utf-8')
      const jobsData = JSON.parse(jobsRaw)
      for (const j of jobsData.jobs || []) {
        if (j.name?.toLowerCase().includes('switch') && j.name?.toLowerCase().includes('cooldown')) {
          const nextRun = j.state?.nextRunAtMs
          if (nextRun && nextRun > now) {
            openaiCooldownNote = `ChatGPT Plus rate limit — switch-back scheduled ${new Date(nextRun).toISOString()}`
          }
        }
      }
    } catch {}

    // Pull provider quota/enforcement windows from OpenClaw status --usage
    let usageProviders: UsageProvider[] = []
    let openaiUsage: UsageProvider | null = null
    try {
      const { stdout } = await execOpenClaw(['status', '--usage', '--json'], 15000)
      const statusPayload = JSON.parse(stdout)
      const rawProviders = statusPayload?.usage?.providers
      if (Array.isArray(rawProviders)) {
        usageProviders = rawProviders.map((p: any) => {
          const buckets: UsageBucket[] = Array.isArray(p?.windows)
            ? p.windows.map((w: any) => {
                const used = Math.max(0, Math.min(100, Number(w?.usedPercent ?? 0)))
                const resetAtMs = Number(w?.resetAt || 0)
                return {
                  label: String(w?.label || 'bucket'),
                  usedPercent: used,
                  remainingPercent: Math.max(0, 100 - used),
                  resetAt: resetAtMs > 0 ? new Date(resetAtMs).toISOString() : null,
                }
              })
            : []

          return {
            provider: String(p?.provider || ''),
            displayName: String(p?.displayName || p?.provider || 'Provider'),
            plan: p?.plan ? String(p.plan) : null,
            error: p?.error ? String(p.error) : undefined,
            buckets,
          }
        })

        openaiUsage = usageProviders.find((p) =>
          p.provider.toLowerCase().includes('openai') ||
          p.displayName.toLowerCase().includes('codex')
        ) ?? null
      }
    } catch {}

    // Fallback to last known usage snapshot if current pull fails/empty.
    if (usageProviders.length === 0) {
      const cachedUsage = await readUsageCache()
      if (cachedUsage) {
        usageProviders = cachedUsage.usageProviders
        openaiUsage = cachedUsage.openaiUsage
      }
    } else {
      await writeUsageCache(usageProviders, openaiUsage)
    }

    const payload = { providers, openaiCooldownNote, openaiUsage, usageProviders }
    cache = { ts: Date.now(), payload }
    return Response.json(payload)
  } catch (err) {
    return Response.json({ error: String(err), providers: [] }, { status: 500 })
  }
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
