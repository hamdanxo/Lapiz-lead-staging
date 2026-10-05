import { NextResponse } from 'next/server';
import { COOKIE, tokenOk } from '@/lib/session';

// Pages that do not need the app code.
const PUBLIC = ['/login', '/api/login', '/counter', '/api/counter', '/api/whatsapp'];

export async function middleware(req) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) return NextResponse.next();
  // Every /api route checks the code itself (requireUser).
  if (path.startsWith('/api/')) return NextResponse.next();
  // Public images (logo etc.) must load on the login and counter pages too.
  if (/\.(svg|png|jpe?g|webp|ico)$/i.test(path)) return NextResponse.next();

  if (await tokenOk(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
