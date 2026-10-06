import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';
import { docsWithLinks } from '@/lib/docs';
import { moveDraft } from '@/lib/drafts';

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

// Save edits, or change status:
//   { id, fields: {...} }                        edit a draft
//   { id, action: 'delete' }                     hide a draft
//   { ids: [...], action: 'move', to: 'draft' | 'filtered' }   move between tabs; from Sent to CRM = recall
//   { id, action: 'restore' }                    old name for move to draft
//   { ids: [...], action: 'remove_sent' }        hide pushed leads from the list, CRM untouched
export async function PATCH(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const body = await req.json();

  if (body.action === 'move' || body.action === 'restore') {
    const to = body.action === 'restore' ? 'draft' : body.to;
    if (!['draft', 'filtered'].includes(to)) return json({ error: 'Can only move to Drafts or Filtered out' }, 400);
    const ids = (body.ids || (body.id ? [body.id] : [])).filter(Boolean).slice(0, 500);
    const results = [];
    for (const id of ids) results.push({ id, ...(await moveDraft(id, to)) });
    return json({ results });
  }

  // { ids: [...], action: 'remove_sent' } clears leads from the "Sent to CRM" list.
  // Only the app's copy is hidden; the lead in Zoho CRM is not touched.
  if (body.action === 'remove_sent') {
    const ids = (body.ids || []).filter(Boolean).slice(0, 500);
    if (!ids.length) return json({ removed: 0 });
    const { data, error } = await db().from('drafts')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .in('id', ids).eq('status', 'pushed').select('id');
    if (error) return json({ error: error.message }, 500);
    return json({ removed: (data || []).length });
  }

  const { data: cur } = await db().from('drafts').select('status').eq('id', body.id).maybeSingle();
  if (!cur) return json({ error: 'Draft not found' }, 404);
  if (cur.status === 'pushed') return json({ error: 'Already sent to CRM, edit it in Zoho instead' }, 409);

  let patch = { updated_at: new Date().toISOString() };
  if (body.action === 'delete') patch.status = 'deleted';
  else {
    for (const k of EDITABLE) if (k in (body.fields || {})) patch[k] = body.fields[k];
  }
  const { data, error } = await db().from('drafts').update(patch).eq('id', body.id).select('*').single();
  if (error) return json({ error: error.message }, 500);
  return json({ draft: data });
}
