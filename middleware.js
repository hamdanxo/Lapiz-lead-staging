import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Pages that do not need a login.
const PUBLIC = ['/login', '/reset', '/counter', '/api/counter', '/api/whatsapp'];

export async function middleware(req) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + '/'))) return NextResponse.next();
  // Every /api route checks the login itself (requireUser), so skip the second check here.
  if (path.startsWith('/api/')) return NextResponse.next();
  // Public images (logo etc.) must load on the login and counter pages too.
  if (/\.(svg|png|jpe?g|webp|ico)$/i.test(path)) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  let email = null;
  try {
    const { data } = await supabase.auth.getClaims();
    email = data && data.claims && data.claims.email;
  } catch {}
  if (!email) {
    const { data } = await supabase.auth.getUser();
    email = data && data.user && data.user.email;
  }
  const ok = !!email && (process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).includes(email.toLowerCase());

  if (!ok) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
