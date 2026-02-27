import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps } from 'firebase-admin/app';

const app = getApps().length === 0
  ? initializeApp({ projectId: 'clawpanel-50d0f' })
  : getApps()[0];

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const defaultUser = { isAuthenticated: false, email: '', name: '', sub: '', groups: [] };

  try {
    const sessionCookie = request.cookies.get('__session')?.value;

    if (!sessionCookie) {
      return NextResponse.json({ user: defaultUser });
    }

    const decoded = await getAuth(app).verifySessionCookie(sessionCookie, true);

    return NextResponse.json({
      user: {
        isAuthenticated: true,
        email: decoded.email || '',
        name: decoded.name || decoded.email?.split('@')[0] || '',
        sub: decoded.uid,
        groups: [],
      },
    });
  } catch (error) {
    return NextResponse.json({ user: defaultUser });
  }
}
