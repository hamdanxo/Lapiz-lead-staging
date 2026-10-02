import { requireUser, json } from '@/lib/auth';
import { connect } from '@/lib/zoho';

export const dynamic = 'force-dynamic';

// Body: { kind: 'crm' | 'mail', client_id, client_secret, code }
export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const b = await req.json();
  if (!['crm', 'mail'].includes(b.kind)) return json({ error: 'kind must be crm or mail' }, 400);
  if (!b.client_id || !b.client_secret || !b.code) return json({ error: 'Client ID, Client Secret and Code are all needed' }, 400);
  try {
    await connect(b.kind, { client_id: b.client_id.trim(), client_secret: b.client_secret.trim(), code: b.code.trim() });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
