import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/cloudflare-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({
      user: { isAuthenticated: false, email: '', name: '', sub: '', groups: [] }
    });
  }
}
