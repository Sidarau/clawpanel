import { NextResponse } from 'next/server'

import { getRunWithSteps } from '@/server/antfarm/db'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'cache-control': 'no-store' }

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const runId =
    typeof ctx.params.id === 'string' ? ctx.params.id.trim() : ''

  if (!runId) {
    return NextResponse.json(
      { error: 'invalid_id' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  try {
    const run = getRunWithSteps(runId)

    if (!run) {
      return NextResponse.json(
        { error: 'not_found' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }

    return NextResponse.json({ run }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json(
      { error: 'Antfarm database unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }
}
