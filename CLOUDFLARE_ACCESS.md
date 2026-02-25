# Cloudflare Access Integration
## ClawPanel Dashboard Authentication

## Setup Complete

### Files Created
- `src/middleware.ts` - Edge middleware for JWT validation
- `src/lib/cloudflare-auth.ts` - Auth utilities for server components
- `src/components/auth-provider.tsx` - React context for client-side auth
- `src/components/user-menu.tsx` - User display + logout button
- `src/app/api/auth/user/route.ts` - API endpoint for user info

### Environment Variables
Add to `.env.local`:
```env
# Cloudflare Access
CF_AUD_TAG=7456e63680b60408c57fd682810126fcdfdbfefa62016c9081cd89e260e82d17
CF_POLICY_ID=21e69ad4-48ce-49f1-95f6-a07286f3e0a5
CF_TEAM_DOMAIN=zeuglab.cloudflareaccess.com

# GoHighLevel (for CRM integration)
GHL_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GHL_LOCATION_ID=oteadO3vIfqV9q5F6vZ5

# YouTube (for KB Drops)
YOUTUBE_API_KEY=AIzaSyBrxsOXL0sqhuVyTqOWRvlC2TuTIcj2A8E
```

### Dependencies
Install jose for JWT handling:
```bash
npm install jose
```

## How It Works

### 1. Middleware (Edge Runtime)
- Runs on every request to `/dashboard/*`
- Extracts JWT from `CF-Access-Jwt-Assertion` header or `CF_Authorization` cookie
- Validates JWT signature against Cloudflare's public keys
- Verifies AUD claim matches your application
- Adds user info to request headers (`x-user-email`, `x-user-sub`, `x-user-name`)
- Redirects to Cloudflare login if invalid/missing

### 2. Server Components
- Use `getUserFromHeaders()` for fast access (middleware already verified)
- Use `getCurrentUser()` for full JWT verification (slower but secure)

### 3. Client Components
- Wrap app in `AuthProvider`
- Use `useAuth()` hook to access user info
- `UserMenu` component shows avatar, name, email, logout button

### 4. Public Routes
These remain accessible without auth:
- `/` - Landing page
- `/api/webhook/*` - Webhooks
- `/api/health` - Health checks
- `/_next/*` - Next.js static files

## Cloudflare Access Configuration

### 1. Application Settings
- **Domain**: `clawpanel.app` (or `dashboard.clawpanel.app`)
- **Session Duration**: 24 hours (configurable)
- **Cookie Settings**: HttpOnly, Secure, SameSite=Lax

### 2. Identity Provider
Google OAuth configured:
- Users authenticate with Google
- Cloudflare issues JWT with user claims
- JWT contains: email, name, sub (user ID), groups, policies

### 3. Access Policies
Policy ID: `21e69ad4-48ce-49f1-95f6-a07286f3e0a5`
- Define who can access (e.g., specific email domains, groups)
- Configure bypass rules for testing if needed

## Testing

### Local Development
1. Set environment variables in `.env.local`
2. Run `npm run dev`
3. Access `http://localhost:3000/dashboard`
4. Should redirect to Cloudflare login
5. After login, redirected back with JWT

### Production
1. Deploy to Vercel/Railway/etc
2. Set environment variables in platform dashboard
3. Configure Cloudflare Access application with production domain
4. Access `https://clawpanel.app/dashboard`

## Troubleshooting

### "Invalid JWT"
- Check CF_AUD_TAG matches Cloudflare Application AUD
- Verify CF_TEAM_DOMAIN is correct
- Ensure system time is synced (JWTs are time-sensitive)

### "Redirect loop"
- Check middleware matcher config
- Ensure `/` (landing) is public
- Verify Cloudflare cookie domain settings

### "User not showing"
- Check browser dev tools for `CF_Authorization` cookie
- Verify API route `/api/auth/user` returns 200
- Check server logs for JWT validation errors

## Next Steps

1. Install dependency: `npm install jose`
2. Set environment variables
3. Test authentication flow
4. Deploy to production
5. Share `clawpanel.app/dashboard` with confidence
