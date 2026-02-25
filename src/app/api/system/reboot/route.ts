import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Fire-and-forget reboot so HTTP response can return before process exits.
    // Uses sudo for Lightsail/Ubuntu. If sudo policy blocks this, caller gets error.
    const child = spawn('bash', ['-lc', '(sleep 2; sudo /sbin/reboot) >/tmp/lightsail-reboot.log 2>&1 &'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    return NextResponse.json({ ok: true, message: 'Reboot initiated. Instance should come back in ~1-2 minutes.' })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to initiate reboot' }, { status: 500 })
  }
}
