/**
 * /api/instance — CRUD for a user's registered OpenClaw instance.
 * Lives on Vercel (never proxied to the instance).
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getInstanceConfig, setInstanceConfig, deleteInstanceConfig,
  testInstanceConnection,
} from '@/lib/user-store';

export const dynamic = 'force-dynamic';

function getUserSub(session: Awaited<ReturnType<typeof getServerSession>>): string | null {
  if (!session?.user) return null;
  return (session.user as typeof session.user & { sub?: string }).sub ?? null;
}

// GET — fetch current user's instance config (without relay secret)
export async function GET() {
  const session = await getServerSession(authOptions);
  const sub = getUserSub(session);
  if (!sub) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getInstanceConfig(sub);
  if (!config) return Response.json({ configured: false });

  return Response.json({
    configured: true,
    instanceUrl: config.instanceUrl,
    connectedAt: config.connectedAt,
    label: config.label ?? null,
    // Never return relaySecret to client
  });
}

// POST — register or update instance config
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const sub = getUserSub(session);
  if (!sub) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { instanceUrl?: string; relaySecret?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const instanceUrl = body.instanceUrl?.trim();
  const relaySecret = body.relaySecret?.trim();

  if (!instanceUrl || !relaySecret) {
    return Response.json({ error: 'instanceUrl and relaySecret are required' }, { status: 400 });
  }

  // Normalize URL
  const normalizedUrl = instanceUrl.replace(/\/+$/, '');

  // Test the connection before saving
  const reachable = await testInstanceConnection(normalizedUrl, relaySecret);
  if (!reachable) {
    return Response.json(
      { error: 'Cannot reach instance. Check the URL and make sure the server is running.' },
      { status: 400 },
    );
  }

  await setInstanceConfig(sub, {
    instanceUrl: normalizedUrl,
    relaySecret,
    connectedAt: new Date().toISOString(),
    label: body.label?.trim() || undefined,
  });

  return Response.json({ ok: true, instanceUrl: normalizedUrl });
}

// DELETE — disconnect instance
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const sub = getUserSub(session);
  if (!sub) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  await deleteInstanceConfig(sub);
  return Response.json({ ok: true });
}
