// Pure helpers (no network), so they can be unit tested.

export function digits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// UAE numbers arrive as 9715..., 05..., +971 5...; compare on the last 9 digits.
export function samePhone(a, b) {
  const x = digits(a);
  const y = digits(b);
  if (!x || !y) return false;
  return x.slice(-9) === y.slice(-9);
}

// UAE phone: accepts 050 123 4567, 501234567, +971 50 123 4567, 00971..., 04 123 4567.
// Returns "+971501234567" style, or null if it is not a valid UAE mobile or landline.
export function normalizeUaePhone(input) {
  let d = digits(input);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('971')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (/^5\d{8}$/.test(d) || /^[234679]\d{7}$/.test(d)) return `+971${d}`;
  return null;
}

// UAE TRN (Tax Registration Number) is exactly 15 digits.
export function validTrn(input) {
  return /^\d{15}$/.test(String(input || '').replace(/\s/g, ''));
}

export function isMayur(sender, mayurNumbers) {
  return (mayurNumbers || []).some((n) => samePhone(sender, n));
}

// True if the message contains any keyword as a whole word (case-insensitive).
export function matchesKeyword(text, keywords) {
  const t = ` ${String(text || '').toLowerCase()} `;
  return (keywords || []).some((k) => {
    const w = String(k).toLowerCase().trim();
    if (!w) return false;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(t);
  });
}

// WhatsApp rule: Mayur always a draft; everyone else needs a keyword, else "filtered".
export function classifyWhatsApp(sender, text, { mayurNumbers, keywords }) {
  if (isMayur(sender, mayurNumbers)) return { source: 'Mayur', status: 'draft' };
  return { source: 'WhatsApp', status: matchesKeyword(text, keywords) ? 'draft' : 'filtered' };
}

// Round robin: returns the next id and the updated pointer.
export function nextInRotation(rotation) {
  const ids = (rotation && rotation.ids) || [];
  if (!ids.length) return { id: null, rotation: { ids, next: 0 } };
  const i = ((rotation.next || 0) % ids.length + ids.length) % ids.length;
  return { id: ids[i], rotation: { ids, next: (i + 1) % ids.length } };
}

export function normCompany(c) {
  return String(c || '')
    .toLowerCase()
    .replace(/\b(llc|l\.l\.c|fze|fzco|trading|est|establishment|co|company|ltd)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
