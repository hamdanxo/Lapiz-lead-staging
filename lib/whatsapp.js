import crypto from 'crypto';
import { classifyWhatsApp, matchesKeyword, numberIn, digits } from './text.js';

// Who may post to /api/whatsapp.
// Meta signs every post with the app secret of the app that holds the webhook subscription.
// With a coexistence partner (Dualhook) that is their app, so we usually cannot check the
// signature ourselves; then a long random key in the webhook URL (?key=...) is the shared
// secret, because Meta posts to exactly the URL we registered. Nothing configured = nothing accepted.
export function webhookAuthorized({ rawBody = '', signature = '', key = '' }, env = process.env) {
  if (env.WHATSAPP_APP_SECRET) {
    const expected = 'sha256=' + crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
    return same(signature, expected);
  }
  if (env.WHATSAPP_WEBHOOK_KEY) return same(key, env.WHATSAPP_WEBHOOK_KEY);
  return false;
}

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// What to do with one incoming message. Pure, so it can be unit-tested.
//   known:    the sender is in the phone's contacts (wa_contacts)
//   existing: the sender's open entry (draft or filtered, last 7 days), or null
// Returns one of:
//   { kind: 'ignore', why }                       known person / ignore list: not saved
//   { kind: 'followup', text }                    Mayur without /lead: add to his last lead
//   { kind: 'append', id, text, promote }         same number again: add to its entry; promote = filtered -> draft
//   { kind: 'insert', source, status, text }      new entry
export function planMessage({ sender, text, known = false, existing = null }, { mayurNumbers = [], keywords = [], ignoreNumbers = [] } = {}) {
  const c = classifyWhatsApp(sender, text, { mayurNumbers, keywords });
  if (c.source === 'Mayur') {
    return c.status === 'draft'
      ? { kind: 'insert', source: 'Mayur', status: 'draft', text: c.text }
      : { kind: 'followup', text: c.text };
  }
  if (known) return { kind: 'ignore', why: 'contact' };
  if (numberIn(sender, ignoreNumbers)) return { kind: 'ignore', why: 'ignore list' };
  const hit = matchesKeyword(text, keywords);
  if (existing) return { kind: 'append', id: existing.id, text: c.text, promote: hit && existing.status === 'filtered' };
  return { kind: 'insert', source: 'WhatsApp', status: hit ? 'draft' : 'filtered', text: c.text };
}

// Contacts from Meta's smb_app_state_sync webhook (the phone's WhatsApp contacts).
// Returns { add: [{ phone, name }], remove: [{ phone }] } with phone as digits only.
export function parseStateSync(value) {
  const out = { add: [], remove: [] };
  for (const s of (value && value.state_sync) || []) {
    if (!s || s.type !== 'contact' || !s.contact) continue;
    const phone = digits(s.contact.phone_number);
    if (phone.length < 7) continue;
    if (s.action === 'remove') out.remove.push({ phone });
    else out.add.push({ phone, name: s.contact.full_name || s.contact.first_name || null });
  }
  return out;
}

// The words in a message, whatever kind it is (text, picture caption, file name, button).
export function messageText(m) {
  return (
    (m.text && m.text.body) ||
    (m.image && m.image.caption) ||
    (m.video && m.video.caption) ||
    (m.document && (m.document.caption || m.document.filename)) ||
    (m.button && m.button.text) ||
    (m.interactive && JSON.stringify(m.interactive)) ||
    `[${m.type || 'unknown'} message]`
  );
}
