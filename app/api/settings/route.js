import { requireUser, json } from '@/lib/auth';
import { db, getSetting, setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// How many of the phone's WhatsApp contacts we know, and when the last sync arrived.
async function contactsInfo() {
  try {
    const [{ count }, { data }] = await Promise.all([
      db().from('wa_contacts').select('phone', { count: 'exact', head: true }),
      db().from('wa_contacts').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ]);
    return { count: count || 0, updated_at: data && data[0] ? data[0].updated_at : null };
  } catch { return { count: 0, updated_at: null }; }
}

export async function GET() {
  const auth = await requireUser(); if (auth.error) return auth.error;
  return json({
    rotation: await getSetting('rotation', { ids: [], next: 0 }),
    keywords: await getSetting('keywords', []),
    mayur_numbers: await getSetting('mayur_numbers', []),
    ignore_numbers: await getSetting('ignore_numbers', []),
    contacts: await contactsInfo(),
  });
}

const onlyDigits = (list) => list.map((n) => String(n).replace(/\D/g, '')).filter(Boolean);

export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const b = await req.json();
  if (Array.isArray(b.rotation_ids)) await setSetting('rotation', { ids: b.rotation_ids, next: 0 });
  if (Array.isArray(b.keywords)) await setSetting('keywords', b.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  if (Array.isArray(b.mayur_numbers)) await setSetting('mayur_numbers', onlyDigits(b.mayur_numbers));
  if (Array.isArray(b.ignore_numbers)) await setSetting('ignore_numbers', onlyDigits(b.ignore_numbers));
  return json({ ok: true });
}
