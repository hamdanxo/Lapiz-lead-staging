import { NextResponse } from 'next/server';
import { pinOk } from '@/lib/pin';
import { getSetting, setSetting } from '@/lib/db';
import { COOKIE, DAYS, makeToken } from '@/lib/session';

export const dynamic = 'force-dynamic';
const MAX_TRIES = 10;
const LOCK_MS = 15 * 60e3;

// POST { pin } -> sets the login cookie. 10 wrong codes from one device = locked 15 minutes.
export async function POST(req) {
  if (!process.env.APP_PIN) return NextResponse.json({ error: 'Login code is not set up yet (APP_PIN missing in Vercel).' }, { status: 503 });
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const k = `login_fail:${ip}`;
  const rec = (await getSetting(k).catch(() => null)) || { n: 0, at: 0 };
  const fresh = Date.now() - rec.at > LOCK_MS ? { n: 0, at: Date.now() } : rec;
  if (fresh.n >= MAX_TRIES) {
    const mins = Math.ceil((fresh.at + LOCK_MS - Date.now()) / 60e3);
    return NextResponse.json({ error: `Too many wrong codes. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` }, { status: 429 });
  }

  const { pin } = await req.json().catch(() => ({}));
  if (!(await pinOk(pin, 'APP_PIN'))) {
    await setSetting(k, { n: fresh.n + 1, at: fresh.at || Date.now() }).catch(() => {});
    const left = MAX_TRIES - fresh.n - 1;
    return NextResponse.json({ error: left > 0 ? `Wrong code. ${left} tr${left > 1 ? 'ies' : 'y'} left.` : 'Too many wrong codes. Try again in 15 minutes.' }, { status: 401 });
  }

  if (rec.n) await setSetting(k, { n: 0, at: 0 }).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DAYS * 86400 });
  return res;
}
