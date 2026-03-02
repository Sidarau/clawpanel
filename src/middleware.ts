import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import {
  shouldProxy, proxyToInstance,
  isLocalInstance, validateRelayRequest,
  HDR_FWD_EMAIL, HDR_FWD_NAME, HDR_FWD_SUB,
} from '@/lib/relay';

export default withAuth(
  async function middleware(req: NextRequest & { nextauth?: { token?: Record<string, unknown> } }) {
    const { pathname } = req.nextUrl;

    // ── Relay mode (Vercel → local instance) ──────────────────────────────
    // When INSTANCE_URL is set, proxy API requests to the OpenClaw host.
    if (shouldProxy(pathname)) {
      const token = req.nextauth?.token;
      return proxyToInstance({
        request: req,
        userEmail: (token?.email as string) || undefined,
        userName: (token?.name as string) || undefined,
        userSub: (token?.sub as string) || undefined,
      });
    }

    // ── Local instance mode (receive proxied requests from Vercel) ─────────
    // Accept requests forwarded by the remote deployment (relay secret auth).
    if (isLocalInstance && req.headers.has('x-relay-secret')) {
      const identity = validateRelayRequest(req.headers);
      if (identity) {
        // Valid relay request — let it through without NextAuth session check.
        const resp = NextResponse.next();
        resp.headers.set(HDR_FWD_EMAIL, identity.email);
        resp.headers.set(HDR_FWD_NAME, identity.name);
        resp.headers.set(HDR_FWD_SUB, identity.sub);
        return resp;
      }
      // Invalid relay secret — reject
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Allow relay requests through without a NextAuth token
        if (isLocalInstance && req.headers.has('x-relay-secret')) return true;
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
