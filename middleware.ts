import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/session-check',
  '/api/health',
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api/') || isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const checkUrl = new URL('/api/auth/session-check', request.url);
  const check = await fetch(checkUrl, {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
  });

  if (check.ok) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { success: false, errorCode: 'INVALID_REQUEST', error: '请先登录' },
    { status: 401 },
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|avatars/).*)'],
};
