import assert from 'node:assert/strict'
import test from 'node:test'

import { GET, runtime } from '../src/app/api/health/route'

test('GET /api/health returns {ok:true}', async () => {
  const res = await GET(new Request('http://localhost/api/health'))

  assert.equal(res.status, 200)
  const json = await res.json()
  assert.deepEqual(json, { ok: true })
})

test('health route runtime is nodejs', () => {
  assert.equal(runtime, 'nodejs')
})
