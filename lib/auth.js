import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, tokenOk } from './session';

// Returns who did it (the app has one shared login), or a 401 response to send back.
export async function requireUser() {
  const ok = await tokenOk(cookies().get(COOKIE)?.value);
  if (!ok) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  return { email: 'Lead app' };
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}
