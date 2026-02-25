import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json')

// POST — update an agent's model in openclaw.json
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { agentId, model } = body

    if (!agentId || !model) {
      return Response.json({ error: 'Missing agentId or model' }, { status: 400 })
    }

    // Read current config
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)

    // Find agent in agents.list
    const agents = config?.agents?.list ?? []
    const agent = agents.find((a: Record<string, unknown>) => {
      // Match by ID or by dir-name format
      return a.id === agentId || (a.id as string).replace(/\//g, '-') === agentId
    })

    if (agent) {
      agent.model = model
    } else {
      // Agent not in config list — add it
      if (!config.agents) config.agents = {}
      if (!config.agents.list) config.agents.list = []
      config.agents.list.push({ id: agentId, model })
    }

    // Write back
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')

    return Response.json({ ok: true, agentId, model })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

// GET — read available models from config
export async function GET() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)

    const byId = new Map<string, { id: string; alias?: string }>()
    const add = (id?: string, alias?: string) => {
      if (!id || typeof id !== 'string') return
      const trimmed = id.trim()
      if (!trimmed) return
      const existing = byId.get(trimmed)
      if (existing) {
        if (!existing.alias && alias) existing.alias = alias
      } else {
        byId.set(trimmed, { id: trimmed, alias })
      }
    }

    // 1) Explicit models map in config
    const modelsConfig = config?.agents?.defaults?.models ?? {}
    for (const [id, cfg] of Object.entries(modelsConfig)) {
      const alias = (cfg as Record<string, unknown>)?.alias as string | undefined
      add(id, alias)
    }

    // 2) Global default/fallback chain
    add(config?.agents?.defaults?.model?.primary)
    for (const m of config?.agents?.defaults?.model?.fallbacks ?? []) add(m)

    // 3) Subagent default/fallback chain
    add(config?.agents?.defaults?.subagents?.model?.primary)
    for (const m of config?.agents?.defaults?.subagents?.model?.fallbacks ?? []) add(m)

    // 4) Per-agent overrides
    for (const a of config?.agents?.list ?? []) add(a?.model)

    // 5) Always expose common Google + OpenAI options in the picker
    const googleDefaults: Array<{ id: string; alias?: string }> = [
      { id: 'google-antigravity/gemini-3-flash', alias: 'gemini-3-flash' },
      { id: 'google-antigravity/gemini-3-pro', alias: 'gemini-3-pro' },
      { id: 'google-antigravity/gemini-2.5-flash', alias: 'gemini-2.5-flash' },
      { id: 'google-antigravity/gemini-2.5-pro', alias: 'gemini-2.5-pro' },
    ]
    for (const g of googleDefaults) add(g.id, g.alias)

    const openaiDefaults: Array<{ id: string; alias?: string }> = [
      { id: 'openai/gpt-5.2', alias: 'gpt-5.2' },
      { id: 'openai/gpt-4.1-mini', alias: 'gpt-4.1-mini' },
      { id: 'openai/gpt-4.1-nano', alias: 'gpt-4.1-nano' },
      { id: 'openai-codex/gpt-5.2-codex', alias: 'gpt-5.2-codex' },
      { id: 'openai-codex/gpt-5.3-codex', alias: 'gpt-5.3-codex' },
    ]
    for (const o of openaiDefaults) add(o.id, o.alias)

    const models = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))

    return Response.json({ models })
  } catch {
    return Response.json({ models: [] })
  }
}
