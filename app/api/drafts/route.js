import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const EDITABLE = ['company', 'contact_name', 'phone', 'email', 'approx_qty', 'customer_category', 'products', 'salesman_id', 'salesman_name', 'notes', 'source'];

export async function GET(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const status = new URL(req.url).searchParams.get('status') || 'draft';
  const q = db().from('drafts').select('*').eq('status', status)
    .order(status === 'pushed' ? 'pushed_at' : 'created_at', { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const counts = {};
  for (const s of ['draft', 'filtered', 'pushed']) {
    const { count } = await db().from('drafts').select('id', { count: 'exact', head: true }).eq('status', s);
    counts[s] = count || 0;
  }
  return json({ drafts: data, counts });
}

// Save edits, or change status: { id, action: 'delete' | 'restore' } or { id, fields: {...} }
export async function PATCH(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const body = await req.json();
  const { data: cur } = await db().from('drafts').select('status').eq('id', body.id).maybeSingle();
  if (!cur) return json({ error: 'Draft not found' }, 404);
  if (cur.status === 'pushed') return json({ error: 'Already sent to CRM, edit it in Zoho instead' }, 409);

  let patch = { updated_at: new Date().toISOString() };
  if (body.action === 'delete') patch.status = 'deleted';
  else if (body.action === 'restore') patch.status = 'draft';
  else {
    for (const k of EDITABLE) if (k in (body.fields || {})) patch[k] = body.fields[k];
  }
  const { data, error } = await db().from('drafts').update(patch).eq('id', body.id).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ draft: data });
}
