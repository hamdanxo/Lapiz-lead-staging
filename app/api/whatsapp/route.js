import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { classifyWhatsApp } from '@/lib/text';
import { insertDraft } from '@/lib/drafts';

export const dynamic = 'force-dynamic';

// Meta calls this once when you save the webhook, to check it's really us.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Meta calls this for every incoming message.
export async function POST(req) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return new Response('Bad signature', { status: 401 });
    }
  }
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const mayurNumbers = await getSetting('mayur_numbers', []);
  const keywords = await getSetting('keywords', []);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        const text =
          (m.text && m.text.body) ||
          (m.image && m.image.caption) ||
          (m.document && (m.document.caption || m.document.filename)) ||
          (m.button && m.button.text) ||
          (m.interactive && JSON.stringify(m.interactive)) ||
          `[${m.type} message]`;
        const { source, status } = classifyWhatsApp(m.from, text, { mayurNumbers, keywords });
        try {
          await insertDraft({
            source, status,
            external_id: `wa:${m.id}`,
            sender: m.from,
            phone: source === 'Mayur' ? null : `+${m.from}`,
            contact_name: source === 'Mayur' ? null : names[m.from] || null,
            raw_text: String(text).slice(0, 20000),
          });
        } catch (e) {
          console.error('whatsapp insert failed', e.message);
        }
      }
    }
  }
  // Always 200 quickly, or Meta keeps retrying.
  return NextResponse.json({ ok: true });
}
