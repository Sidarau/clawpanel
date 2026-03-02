import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import {
  shouldProxyPath, proxyToInstance,
  isLocalInstance, validateRelayRequest,
  HDR_FWD_EMAIL, HDR_FWD_NAME, HDR_FWD_SUB,
} from '@/lib/relay';
import type { InstanceConfig } from '@/lib/user-store';

// Edge-compatible Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Paths that bypass proxying even in relay mode
const SETUP_PATH = '/setup';

export default withAuth(
  async function middleware(req: NextRequest & { nextauth?: { token?: Record<string, unknown> } }) {
    const { pathname } = req.nextUrl;

    // ── 1. Local instance: validate incoming relay requests ──────────────
    // When this server IS the OpenClaw instance, accept proxied calls from Vercel.
    if (isLocalInstance && req.headers.has('x-relay-secret')) {
      const identity = validateRelayRequest(req.headers);
      if (identity) {
        const resp = NextResponse.next();
        resp.headers.set(HDR_FWD_EMAIL, identity.email);
        resp.headers.set(HDR_FWD_NAME, identity.name);
        resp.headers.set(HDR_FWD_SUB, identity.sub);
        return resp;
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Remote (Vercel): proxy API calls to user's instance ───────────
    if (!isLocalInstance && shouldProxyPath(pathname)) {
      const token = req.nextauth?.token;
      const sub = token?.sub as string | undefined;

      if (!sub) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Look up this user's instance config from KV
      const config = await redis.get<InstanceConfig>(`user:${sub}:instance`);

      if (!config) {
        return NextResponse.json(
          { error: 'No instance configured', code: 'NO_INSTANCE' },
          { status: 503 },
        );
      }

      return proxyToInstance({
        request: req,
        userEmail: token?.email as string | undefined,
        userName: token?.name as string | undefined,
        userSub: sub,
        instanceUrl: config.instanceUrl,
        relaySecret: config.relaySecret,
      });
    }

    // ── 3. Page routes: redirect to /setup if no instance configured ─────
    if (
      !isLocalInstance &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith(SETUP_PATH) &&
      !pathname.startsWith('/login')
    ) {
      const token = req.nextauth?.token;
      const sub = token?.sub as string | undefined;

      if (sub) {
        const config = await redis.get<InstanceConfig>(`user:${sub}:instance`);
        if (!config) {
          return NextResponse.redirect(new URL(SETUP_PATH, req.url));
        }
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = (req as NextRequest).nextUrl;
        // Let relay requests through without a NextAuth session
        if (isLocalInstance && req.headers.has('x-relay-secret')) return true;
        // Setup page needs auth to know who's setting up
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth|login).*)',
  ],
};
