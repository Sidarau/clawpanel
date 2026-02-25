import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const APP_SRC_DIR = path.join(process.cwd(), 'src')
const DB_MODULE_PATH = path.join(APP_SRC_DIR, 'server', 'antfarm', 'db.ts')

const walkFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return walkFiles(fullPath)
    }

    return fullPath
  })
}

test('DB access module enforces server-only boundary', () => {
  const source = fs.readFileSync(DB_MODULE_PATH, 'utf8')
  const firstStatement = source.trimStart().split('\n')[0]

  assert.equal(firstStatement, "import 'server-only'")
})

test('Antfarm DB module is only imported by API routes', () => {
  const sourceFiles = walkFiles(APP_SRC_DIR).filter(
    (filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx')
  )

  const importTargets = [
    "@/server/antfarm/db",
    '../server/antfarm/db',
    '../../server/antfarm/db',
  ]

  const importers = sourceFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    return importTargets.some((target) => source.includes(target))
  })

  assert.ok(importers.length > 0)
  for (const importer of importers) {
    const normalized = importer.split(path.sep).join('/')
    assert.ok(
      normalized.includes('/src/app/api/'),
      `Unexpected importer outside API routes: ${normalized}`
    )
  }
})
