import 'server-only'

import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type JsonRecord = Record<string, unknown>

type RunWithSteps = JsonRecord & {
  steps: JsonRecord[]
  contextJson: unknown | null
}

const DEFAULT_DB_PATH = path.join(os.homedir(), '.openclaw/antfarm/antfarm.db')

const resolveDbPath = () => process.env.ANTFARM_DB_PATH ?? DEFAULT_DB_PATH

const parseRunContext = (run: JsonRecord): RunWithSteps => {
  const contextValue = run.context
  if (typeof contextValue === 'string') {
    try {
      return { ...run, steps: [], contextJson: JSON.parse(contextValue) }
    } catch {
      return { ...run, steps: [], contextJson: null }
    }
  }

  return { ...run, steps: [], contextJson: null }
}

const openDatabase = () => new DatabaseSync(resolveDbPath(), { readOnly: true })

export const listRunsWithSteps = (): RunWithSteps[] => {
  const db = openDatabase()
  try {
    const runs = db
      .prepare('SELECT * FROM runs ORDER BY created_at DESC')
      .all() as JsonRecord[]
    const stepsStatement = db.prepare(
      'SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC'
    )

    return runs.map((run) => {
      const runWithContext = parseRunContext(run)
      const steps = stepsStatement.all(run.id) as JsonRecord[]
      return { ...runWithContext, steps }
    })
  } finally {
    db.close()
  }
}

export const getRunWithSteps = (runId: string): RunWithSteps | null => {
  const db = openDatabase()
  try {
    const run = db
      .prepare('SELECT * FROM runs WHERE id = ?')
      .get(runId) as JsonRecord | undefined

    if (!run) {
      return null
    }

    const steps = db
      .prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC')
      .all(runId) as JsonRecord[]

    const runWithContext = parseRunContext(run)
    return { ...runWithContext, steps }
  } finally {
    db.close()
  }
}
