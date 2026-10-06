import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { classifyWhatsApp } from '@/lib/text';
import { db } from '@/lib/db';
import { insertDraft } from '@/lib/drafts';
import { webhookAuthorized, messageText } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// Meta calls this once when you save the webhook, to check it's really us.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Meta calls this for every incoming message. Signature or URL key must match (see lib/whatsapp.js).
export async function POST(req) {
  const raw = await req.text();
  const ok = webhookAuthorized({
    rawBody: raw,
    signature: req.headers.get('x-hub-signature-256') || '',
    key: new URL(req.url).searchParams.get('key') || '',
  });
  if (!ok) return new Response('Not allowed', { status: 401 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const mayurNumbers = await getSetting('mayur_numbers', []);
  const keywords = await getSetting('keywords', []);

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      // Coexistence also sends the staff's own replies (smb_message_echoes), old chats
      // (history) and contacts (smb_app_state_sync). Only real incoming messages count.
      if (change.field !== 'messages') continue;
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        const text = messageText(m);
        const { source, status, text: body } = classifyWhatsApp(m.from, text, { mayurNumbers, keywords });
        try {
          if (status === 'followup') {
            // Mayur's message without /lead: add it to his lead from the last 10 minutes,
            // so he can send "/lead" and then forward the customer's details. Otherwise it is
            // normal chat and is not stored.
            const since = new Date(Date.now() - 10 * 60e3).toISOString();
            const { data: last } = await db().from('drafts').select('id,raw_text')
              .eq('source', 'Mayur').eq('status', 'draft').gte('created_at', since)
              .order('created_at', { ascending: false }).limit(1);
            const d = last && last[0];
            if (d) {
              await db().from('drafts').update({
                raw_text: `${d.raw_text || ''}\n\n${body}`.slice(0, 20000),
                parsed: false,
                updated_at: new Date().toISOString(),
              }).eq('id', d.id);
            }
            continue;
          }
          await insertDraft({
            source, status,
            external_id: `wa:${m.id}`,
            sender: m.from,
            phone: source === 'Mayur' ? null : `+${m.from}`,
            contact_name: source === 'Mayur' ? null : names[m.from] || null,
            raw_text: String(body || text).slice(0, 20000),
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
