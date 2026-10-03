import { requireUser, json } from '@/lib/auth';
import { connect } from '@/lib/zoho';

export const dynamic = 'force-dynamic';

// Body: { kind: 'crm' | 'mail', client_id, client_secret, code }
export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const b = await req.json();
  if (!['crm', 'mail'].includes(b.kind)) return json({ error: 'kind must be crm or mail' }, 400);
  if (!b.code) return json({ error: 'The generated code is needed' }, 400);
  try {
    // ID and secret may be left empty to reuse the saved ones (adding a permission later).
    await connect(b.kind, { client_id: (b.client_id || '').trim(), client_secret: (b.client_secret || '').trim(), code: b.code.trim() });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
