import { requireUser, json } from '@/lib/auth';
import { getSetting, setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireUser(); if (auth.error) return auth.error;
  return json({
    rotation: await getSetting('rotation', { ids: [], next: 0 }),
    keywords: await getSetting('keywords', []),
    mayur_numbers: await getSetting('mayur_numbers', []),
  });
}

export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const b = await req.json();
  if (Array.isArray(b.rotation_ids)) await setSetting('rotation', { ids: b.rotation_ids, next: 0 });
  if (Array.isArray(b.keywords)) await setSetting('keywords', b.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  if (Array.isArray(b.mayur_numbers)) await setSetting('mayur_numbers', b.mayur_numbers.map((n) => String(n).replace(/\D/g, '')).filter(Boolean));
  return json({ ok: true });
}
