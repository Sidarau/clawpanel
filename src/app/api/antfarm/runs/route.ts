import { NextResponse } from 'next/server'

import { listRunsWithSteps } from '@/server/antfarm/db'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'cache-control': 'no-store' }

export async function GET(_req: Request) {
  try {
    const runs = listRunsWithSteps()
    return NextResponse.json({ runs }, { headers: NO_STORE_HEADERS })
  } catch {
    // Do not leak filesystem paths or driver errors.
    return NextResponse.json(
      { error: 'Antfarm database unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }
}
