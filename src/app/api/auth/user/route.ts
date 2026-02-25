import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/cloudflare-auth';

// Force dynamic rendering since we use headers()
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('[API /auth/user] Error:', error);
    return NextResponse.json(
      { 
        error: error?.message || 'Unknown error',
        user: { isAuthenticated: false, email: '', name: '', sub: '', groups: [] }
      },
      { status: 200 }
    );
  }
}
