import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export function allowed(email) {
  const list = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}

// Returns the signed-in user's email, or a 401 response to send back.
export async function requireUser() {
  // getClaims checks the login token on the spot (signed keys), instead of asking the
  // auth server on every click. Falls back to getUser if the project uses older keys.
  const auth = supabaseServer().auth;
  let email = null;
  try {
    const { data } = await auth.getClaims();
    email = data && data.claims && data.claims.email;
  } catch {}
  if (!email) {
    const { data } = await auth.getUser();
    email = data && data.user && data.user.email;
  }
  if (!allowed(email)) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  return { email };
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
