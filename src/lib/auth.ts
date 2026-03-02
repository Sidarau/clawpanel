import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/** Comma-separated list of allowed emails. Falls back to legacy single-email env var. */
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      return allowedEmails.has(user.email.toLowerCase());
    },
    async jwt({ token, account, profile }) {
      // Persist Google sub in the JWT so we can use it as a stable user key
      if (account?.providerAccountId) {
        token.sub = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose sub in session for client-side use
      if (session.user && token.sub) {
        (session.user as typeof session.user & { sub: string }).sub = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
