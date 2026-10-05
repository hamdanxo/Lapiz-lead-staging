// One shared code for the whole app. After the right code, the browser gets a signed
// cookie for 30 days. Works in middleware (edge) and in API routes (node).
export const COOKIE = 'lead_session';
export const DAYS = 30;

async function key() {
  const secret = `lead-app:${process.env.APP_PIN || ''}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(text) {
  const sig = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeToken() {
  const exp = Date.now() + DAYS * 864e5;
  return `${exp}.${await sign(`lead:${exp}`)}`;
}

export async function tokenOk(token) {
  if (!process.env.APP_PIN || !token) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = await sign(`lead:${exp}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
