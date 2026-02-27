'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Check if already logged in
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user && user.email === 'alexsidarau@gmail.com') {
                router.push('/');
            }
        });
        return () => unsubscribe();
    }, [router]);

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');

        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);

            if (result.user.email === 'alexsidarau@gmail.com') {
                // Create session cookie (handled by API route)
                const idToken = await result.user.getIdToken();
                await fetch('/api/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken })
                });
                router.push('/');
            } else {
                setError('Unauthorized email');
                await auth.signOut();
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-900">
            <div className="p-8 bg-neutral-800 rounded-lg max-w-md w-full">
                <h1 className="text-2xl font-bold text-white mb-2">ClawPanel</h1>
                <p className="text-neutral-400 mb-6">Sign in to access your dashboard</p>

                {error && (
                    <div className="p-3 bg-red-900/50 text-red-200 rounded mb-4">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 p-3 bg-white text-neutral-900 rounded font-medium hover:bg-neutral-100 disabled:opacity-50"
                >
                    {loading ? (
                        'Signing in...'
                    ) : (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Sign in with Google
                        </>
                    )}
                </button>

                <p className="mt-4 text-sm text-neutral-500 text-center">
                    Only alexsidarau@gmail.com is authorized
                </p>
            </div>
        </div>
    );
}
