#!/usr/bin/env node

const args = process.argv.slice(2)
const baseUrlArgIndex = args.indexOf('--base-url')
const baseUrlInput =
  baseUrlArgIndex >= 0 && args[baseUrlArgIndex + 1]
    ? args[baseUrlArgIndex + 1]
    : process.env.CLAWPANEL_BASE_URL ?? 'http://localhost:3000'

const baseUrl = baseUrlInput.replace(/\/$/, '')

const assertJsonEndpoint = async ({ url, label, validate }) => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  })

  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}`)
  }

  const payload = await response.json()
  validate(payload)
}

const main = async () => {
  await assertJsonEndpoint({
    url: `${baseUrl}/api/health`,
    label: '/api/health',
    validate: (payload) => {
      if (payload?.ok !== true) {
        throw new Error('/api/health missing ok=true')
      }
    },
  })

  await assertJsonEndpoint({
    url: `${baseUrl}/api/antfarm/runs`,
    label: '/api/antfarm/runs',
    validate: (payload) => {
      if (!Array.isArray(payload?.runs)) {
        throw new Error('/api/antfarm/runs missing runs[]')
      }
    },
  })

  console.log(`Smoke check passed for ${baseUrl}`)
}

main().catch((error) => {
  console.error(`Smoke check failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
