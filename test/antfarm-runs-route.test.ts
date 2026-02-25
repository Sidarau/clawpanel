import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { DatabaseSync } from 'node:sqlite'

import { GET, runtime } from '../src/app/api/antfarm/runs/route'

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
  insertRun.run('run-1', '2026-02-12T11:00:00Z', 'done', 'not json')
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

const restoreEnv = (previous: string | undefined) => {
  if (previous === undefined) {
    delete process.env.ANTFARM_DB_PATH
  } else {
    process.env.ANTFARM_DB_PATH = previous
  }
}

test('GET /api/antfarm/runs returns runs with steps', async () => {
  const { dbPath, cleanup } = createTempDb()
  const previousDbPath = process.env.ANTFARM_DB_PATH
  process.env.ANTFARM_DB_PATH = dbPath

  try {
    const res = await GET(new Request('http://localhost/api/antfarm/runs'))

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const json = await res.json()
    assert.ok(Array.isArray(json.runs))
    assert.equal(json.runs.length, 2)
    assert.equal(json.runs[0].id, 'run-2')
    assert.deepEqual(
      json.runs[0].steps.map((step: { step_index: unknown }) =>
        Number(step.step_index)
      ),
      [0]
    )
  } finally {
    restoreEnv(previousDbPath)
    cleanup()
  }
})

test('GET /api/antfarm/runs returns sanitized error for missing DB', async () => {
  const previousDbPath = process.env.ANTFARM_DB_PATH
  const missingPath = path.join(
    os.tmpdir(),
    'missing-antfarm-db',
    String(Date.now()),
    'antfarm.db'
  )
  process.env.ANTFARM_DB_PATH = missingPath

  try {
    const res = await GET(new Request('http://localhost/api/antfarm/runs'))

    assert.equal(res.status, 503)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const json = await res.json()
    assert.equal(json.error, 'Antfarm database unavailable')
    assert.ok(!JSON.stringify(json).includes(missingPath))
  } finally {
    restoreEnv(previousDbPath)
  }
})

test('antfarm runs route runtime is nodejs', () => {
  assert.equal(runtime, 'nodejs')
})
