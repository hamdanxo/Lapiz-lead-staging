import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';
import { docsWithLinks } from '@/lib/docs';

export const dynamic = 'force-dynamic';

const EDITABLE = ['company', 'contact_name', 'phone', 'email', 'approx_qty', 'trn', 'customer_category', 'products', 'salesman_id', 'salesman_name', 'notes', 'source'];

export async function GET(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const status = new URL(req.url).searchParams.get('status') || 'draft';
  const count = (s) => db().from('drafts').select('id', { count: 'exact', head: true }).eq('status', s);
  const [list, c1, c2, c3] = await Promise.all([
    db().from('drafts').select('*').eq('status', status)
      .order(status === 'pushed' ? 'pushed_at' : 'created_at', { ascending: false }).limit(200),
    count('draft'), count('filtered'), count('pushed'),
  ]);
  if (list.error) return json({ error: list.error.message }, 500);
  const drafts = list.data || [];
  const docs = await docsWithLinks(drafts.map((d) => d.id)).catch(() => []);
  return json({ drafts, docs, counts: { draft: c1.count || 0, filtered: c2.count || 0, pushed: c3.count || 0 } });
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
