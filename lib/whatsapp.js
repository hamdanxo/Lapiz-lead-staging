import crypto from 'crypto';

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
