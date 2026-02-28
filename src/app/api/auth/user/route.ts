import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const defaultUser = { isAuthenticated: false, email: '', name: '', sub: '', groups: [] };

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ user: defaultUser });
    }

    return NextResponse.json({
      user: {
        isAuthenticated: true,
        email: session.user.email,
        name: session.user.name || session.user.email.split('@')[0],
        sub: session.user.email,
        groups: [],
      },
    });
  } catch {
    return NextResponse.json({ user: defaultUser });
  }
}
