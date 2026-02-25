import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { DatabaseSync } from 'node:sqlite'

import { GET, runtime } from '../src/app/api/antfarm/runs/[id]/route'

type TempDb = {
  dbPath: string
  cleanup: () => void
}

const createTempDb = (): TempDb => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antfarm-run-id-'))
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
    '2026-02-12T12:00:00Z',
    'running',
    JSON.stringify({ flow: 'beta' })
  )

  const insertStep = db.prepare(
    'INSERT INTO steps (id, run_id, step_index, name) VALUES (?, ?, ?, ?)'
  )
  insertStep.run('step-1', 'run-1', 1, 'second')
  insertStep.run('step-0', 'run-1', 0, 'first')

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

test('GET /api/antfarm/runs/:id returns run with steps', async () => {
  const { dbPath, cleanup } = createTempDb()
  const previousDbPath = process.env.ANTFARM_DB_PATH
  process.env.ANTFARM_DB_PATH = dbPath

  try {
    const res = await GET(new Request('http://localhost/api/antfarm/runs/run-1'), {
      params: { id: 'run-1' },
    })

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const json = await res.json()
    assert.equal(json.run.id, 'run-1')
    assert.deepEqual(
      json.run.steps.map((step: { step_index: unknown }) =>
        Number(step.step_index)
      ),
      [0, 1]
    )
  } finally {
    restoreEnv(previousDbPath)
    cleanup()
  }
})

test('GET /api/antfarm/runs/:id returns 404 when run does not exist', async () => {
  const { dbPath, cleanup } = createTempDb()
  const previousDbPath = process.env.ANTFARM_DB_PATH
  process.env.ANTFARM_DB_PATH = dbPath

  try {
    const res = await GET(
      new Request('http://localhost/api/antfarm/runs/does-not-exist'),
      {
        params: { id: 'does-not-exist' },
      }
    )

    assert.equal(res.status, 404)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const json = await res.json()
    assert.equal(json.error, 'not_found')
  } finally {
    restoreEnv(previousDbPath)
    cleanup()
  }
})

test('GET /api/antfarm/runs/:id validates id', async () => {
  const res = await GET(new Request('http://localhost/api/antfarm/runs/%20%20'), {
    params: { id: '   ' },
  })

  assert.equal(res.status, 400)
  assert.equal(res.headers.get('cache-control'), 'no-store')

  const json = await res.json()
  assert.equal(json.error, 'invalid_id')
})

test('GET /api/antfarm/runs/:id returns sanitized DB error', async () => {
  const previousDbPath = process.env.ANTFARM_DB_PATH
  const missingPath = path.join(
    os.tmpdir(),
    'missing-antfarm-db',
    String(Date.now()),
    'antfarm.db'
  )
  process.env.ANTFARM_DB_PATH = missingPath

  try {
    const res = await GET(new Request('http://localhost/api/antfarm/runs/run-1'), {
      params: { id: 'run-1' },
    })

    assert.equal(res.status, 503)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const json = await res.json()
    assert.equal(json.error, 'Antfarm database unavailable')
    assert.ok(!JSON.stringify(json).includes(missingPath))
  } finally {
    restoreEnv(previousDbPath)
  }
})

test('antfarm run-by-id route runtime is nodejs', () => {
  assert.equal(runtime, 'nodejs')
})
