import crypto from 'crypto';

// envName: COUNTER_PIN for the counter form, APP_PIN for the main login.
export async function pinOk(pin, envName = 'COUNTER_PIN') {
  const expected = process.env[envName] || '';
  const a = Buffer.from(String(pin || ''));
  const b = Buffer.from(expected);
  const ok = expected.length >= 4 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) await new Promise((r) => setTimeout(r, 1500)); // slows down guessing
  return ok;
}
