import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase().includes('cf') || key.toLowerCase().includes('auth')) {
      headers[key] = value.substring(0, 100);
    }
  });
  
  return NextResponse.json({
    message: 'Auth debug endpoint',
    hasCfHeader: !!request.headers.get('CF-Access-Jwt-Assertion'),
    headers,
    url: request.url,
    timestamp: new Date().toISOString()
  });
}
