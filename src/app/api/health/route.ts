import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(_req: Request) {
  return NextResponse.json({ ok: true })
}
