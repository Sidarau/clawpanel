import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { cookies, headers } from 'next/headers';

export interface CFUser {
  email: string;
  name: string;
  sub: string;
  groups: string[];
  isAuthenticated: boolean;
}

// Hardcoded values from Alex's setup
const CF_TEAM_DOMAIN = 'zeuglab.cloudflareaccess.com';

// Cache for JWKS
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCloudflareJWKS() {
  if (!jwksCache) {
    const jwksUrl = `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`;
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksCache;
}

/**
 * Decode JWT payload without verification
 */
function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Get current user from Cloudflare Access
 */
export async function getCurrentUser(): Promise<CFUser> {
  const defaultUser: CFUser = {
    email: '',
    name: '',
    sub: '',
    groups: [],
    isAuthenticated: false,
  };
  
  try {
    const headersList = await headers();
    const cookieStore = await cookies();
    
    // First, trust middleware-injected local headers (for Tailscale/private IP bypass)
    const localEmail = headersList.get('x-user-email');
    if (localEmail) {
      return {
        email: localEmail,
        name: headersList.get('x-user-name') || localEmail.split('@')[0],
        sub: headersList.get('x-user-sub') || localEmail,
        groups: [],
        isAuthenticated: true,
      };
    }

    // Get JWT from header (primary) or cookie (fallback)
    const jwtHeader = headersList.get('CF-Access-Jwt-Assertion') || 
                      headersList.get('cf-access-jwt-assertion');
    const jwtCookie = cookieStore.get('CF_Authorization')?.value;
    const token = jwtHeader || jwtCookie;
    
    if (!token) {
      return defaultUser;
    }
    
    // Decode without verification to extract user info
    const payload = decodeJWT(token);
    if (!payload) {
      return defaultUser;
    }
    
    // Extract user info from JWT payload
    const email = (payload.email as string) || '';
    const name = (payload.name as string) || (payload.common_name as string) || email.split('@')[0];
    const sub = (payload.sub as string) || email;
    
    if (!email) {
      return defaultUser;
    }
    
    return {
      email,
      name,
      sub,
      groups: (payload.groups as string[]) || [],
      isAuthenticated: true,
    };
    
  } catch (error) {
    console.error('[Auth] Error getting current user:', error);
    return defaultUser;
  }
}

/**
 * Get JWT from request
 */
export async function getJWTFromRequest(): Promise<string | null> {
  try {
    const headersList = await headers();
    const cookieStore = await cookies();
    
    return headersList.get('CF-Access-Jwt-Assertion') || 
           cookieStore.get('CF_Authorization')?.value || 
           null;
  } catch (e) {
    return null;
  }
}

/**
 * Build logout URL
 */
export function buildLogoutUrl(returnUrl?: string): string {
  const redirect = returnUrl ? `?return_to=${encodeURIComponent(returnUrl)}` : '';
  return `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/logout${redirect}`;
}

/**
 * Build login URL
 */
export function buildLoginUrl(returnUrl: string): string {
  return `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/login?redirect_url=${encodeURIComponent(returnUrl)}`;
}

/**
 * Require authentication
 */
export async function requireAuth(): Promise<CFUser> {
  const user = await getCurrentUser();
  if (!user.isAuthenticated) {
    throw new Error('Authentication required');
  }
  return user;
}
