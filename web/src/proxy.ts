import { NextResponse, type NextRequest } from 'next/server';

/** Optimistic check only; pages and APIs verify the session themselves. */
export function proxy(req: NextRequest) {
  if (!req.cookies.get('cm_session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/inbox/:path*', '/cases/:path*', '/contacts/:path*', '/flow/:path*', '/templates/:path*', '/reports/:path*', '/users/:path*', '/audit/:path*', '/settings/:path*', '/notifications/:path*'],
};
