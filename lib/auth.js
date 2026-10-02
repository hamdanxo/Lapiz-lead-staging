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
  const { data } = await supabaseServer().auth.getUser();
  const email = data && data.user && data.user.email;
  if (!allowed(email)) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  return { email };
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
