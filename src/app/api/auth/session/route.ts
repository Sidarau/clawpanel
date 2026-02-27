import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps } from 'firebase-admin/app';

const app = getApps().length === 0
    ? initializeApp({ projectId: 'clawpanel-50d0f' })
    : getApps()[0];
const auth = getAuth(app);

export async function POST(request: NextRequest) {
    try {
        const { idToken } = await request.json();

        // Verify ID token
        const decodedToken = await auth.verifyIdToken(idToken);

        // Create session cookie (5 days)
        const expiresIn = 60 * 60 * 24 * 5 * 1000;
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        // Set cookie
        const response = NextResponse.json({ success: true });
        response.cookies.set('__session', sessionCookie, {
            maxAge: expiresIn,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });

        return response;

    } catch (error) {
        console.error('Session error:', error);
        return NextResponse.json(
            { error: 'Invalid token' },
            { status: 401 }
        );
    }
}

export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.delete('__session');
    return response;
}
