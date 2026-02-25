import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { DatabaseSync } from 'node:sqlite'

import { getRunWithSteps, listRunsWithSteps } from '../src/server/antfarm/db'

type TempDb = {
  dbPath: string
  cleanup: () => void
}

const createTempDb = (): TempDb => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antfarm-'))
  const dbPath = path.join(dir, 'antfarm.db')
  const db = new DatabaseSync(dbPath)

  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT,
      context TEXT
    );

    CREATE TABLE steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      name TEXT
    );
  `)

  const insertRun = db.prepare(
    'INSERT INTO runs (id, created_at, status, context) VALUES (?, ?, ?, ?)'
  )
  insertRun.run(
    'run-1',
    '2026-02-12T11:00:00Z',
    'done',
    'not json'
  )
  insertRun.run(
    'run-2',
    '2026-02-12T12:00:00Z',
    'running',
    JSON.stringify({ flow: 'alpha' })
  )

  const insertStep = db.prepare(
    'INSERT INTO steps (id, run_id, step_index, name) VALUES (?, ?, ?, ?)'
  )
  insertStep.run('step-1', 'run-1', 1, 'second')
  insertStep.run('step-0', 'run-1', 0, 'first')
  insertStep.run('step-2', 'run-2', 0, 'only')

  db.close()

  return {
    dbPath,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('Antfarm DB read layer returns runs and steps in order', () => {
  const { dbPath, cleanup } = createTempDb()
  const previousDbPath = process.env.ANTFARM_DB_PATH
  process.env.ANTFARM_DB_PATH = dbPath

  try {
    const runs = listRunsWithSteps()

    assert.equal(runs.length, 2)
    assert.equal(runs[0].id, 'run-2')
    assert.deepEqual(
      runs[0].steps.map((step) => Number(step.step_index)),
      [0]
    )
    assert.deepEqual(runs[0].contextJson, { flow: 'alpha' })

    assert.equal(runs[1].id, 'run-1')
    assert.equal(runs[1].context, 'not json')
    assert.deepEqual(
      runs[1].steps.map((step) => Number(step.step_index)),
      [0, 1]
    )
    assert.equal(runs[1].contextJson, null)

    const run = getRunWithSteps('run-2')
    assert.ok(run)
    assert.equal(run?.id, 'run-2')
    assert.deepEqual(
      run?.steps.map((step) => Number(step.step_index)),
      [0]
    )

    const missing = getRunWithSteps('missing')
    assert.equal(missing, null)
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.ANTFARM_DB_PATH
    } else {
      process.env.ANTFARM_DB_PATH = previousDbPath
    }
    cleanup()
  }
})
