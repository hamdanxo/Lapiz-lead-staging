import crypto from 'crypto';

export async function pinOk(pin) {
  const expected = process.env.COUNTER_PIN || '';
  const a = Buffer.from(String(pin || ''));
  const b = Buffer.from(expected);
  const ok = expected.length >= 4 && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) await new Promise((r) => setTimeout(r, 1500)); // slows down guessing
  return ok;
}
