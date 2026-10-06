import { NextResponse } from 'next/server';
import { db, getSetting } from '@/lib/db';
import { digits } from '@/lib/text';
import { insertDraft } from '@/lib/drafts';
import { webhookAuthorized, messageText, planMessage, parseStateSync } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const WEEK = 7 * 864e5;

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

  const cfg = {
    mayurNumbers: await getSetting('mayur_numbers', []),
    keywords: await getSetting('keywords', []),
    ignoreNumbers: await getSetting('ignore_numbers', []),
  };

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      // The phone's contacts: added or removed people, kept in wa_contacts.
      if (change.field === 'smb_app_state_sync') {
        try { await syncContacts(v); } catch (e) { console.error('whatsapp contact sync failed', e.message); }
        continue;
      }
      // Coexistence also sends the staff's own replies (smb_message_echoes) and old chats
      // (history). Only real incoming messages count.
      if (change.field !== 'messages') continue;
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        try {
          if (!(await firstTime(m.id))) continue; // Meta retried a message we already handled
          const text = messageText(m);
          const [known, existing] = await Promise.all([isKnown(m.from), openEntry(m.from)]);
          const plan = planMessage({ sender: m.from, text, known, existing }, cfg);
          const now = new Date().toISOString();

          if (plan.kind === 'ignore') continue;

          if (plan.kind === 'followup') {
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
                raw_text: `${d.raw_text || ''}\n\n${plan.text}`.slice(0, 20000), parsed: false, updated_at: now,
              }).eq('id', d.id);
            }
            continue;
          }

          if (plan.kind === 'append') {
            // Same number again within 7 days: one entry per number. A keyword moves it to Drafts.
            await db().from('drafts').update({
              raw_text: `${existing.raw_text || ''}\n\n${plan.text}`.slice(0, 20000),
              status: plan.promote ? 'draft' : existing.status,
              contact_name: existing.contact_name || names[m.from] || null,
              parsed: false,
              updated_at: now,
            }).eq('id', plan.id);
            continue;
          }

          await insertDraft({
            source: plan.source, status: plan.status,
            external_id: `wa:${m.id}`,
            sender: m.from,
            phone: plan.source === 'Mayur' ? null : `+${m.from}`,
            contact_name: plan.source === 'Mayur' ? null : names[m.from] || null,
            raw_text: String(plan.text || text).slice(0, 20000),
          });
        } catch (e) {
          console.error('whatsapp message failed', e.message);
        }
      }
    }
  }
  // Always 200 quickly, or Meta keeps retrying.
  return NextResponse.json({ ok: true });
}

// True the first time we see this message id. If the wa_seen table is missing, the
// external_id check in insertDraft still stops duplicate entries.
async function firstTime(id) {
  if (!id) return true;
  try {
    const { data, error } = await db().from('wa_seen').upsert({ id }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
    if (error) throw error;
    return !!(data && data.length);
  } catch (e) {
    console.error('wa_seen check failed', e.message);
    return true;
  }
}

// Is this number saved in the staff phone's WhatsApp contacts?
async function isKnown(from) {
  const key = digits(from).slice(-9);
  if (!key) return false;
  try {
    const { data } = await db().from('wa_contacts').select('phone').eq('phone_key', key).limit(1);
    return !!(data && data.length);
  } catch { return false; }
}

// The number's open entry: a WhatsApp draft or filtered item with a message in the last 7 days.
async function openEntry(from) {
  const since = new Date(Date.now() - WEEK).toISOString();
  try {
    const { data } = await db().from('drafts').select('id,status,raw_text,contact_name')
      .eq('sender', from).eq('source', 'WhatsApp').in('status', ['draft', 'filtered'])
      .gte('updated_at', since).order('updated_at', { ascending: false }).limit(1);
    return data && data[0] ? data[0] : null;
  } catch { return null; }
}

async function syncContacts(v) {
  const { add, remove } = parseStateSync(v);
  const now = new Date().toISOString();
  if (add.length) {
    const rows = add.map((c) => ({ phone: c.phone, phone_key: c.phone.slice(-9), name: c.name, updated_at: now }));
    const { error } = await db().from('wa_contacts').upsert(rows, { onConflict: 'phone' });
    if (error) throw new Error(error.message);
  }
  if (remove.length) {
    const { error } = await db().from('wa_contacts').delete().in('phone', remove.map((c) => c.phone));
    if (error) throw new Error(error.message);
  }
}
