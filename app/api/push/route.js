import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';
import { crmCreateLead } from '@/lib/zoho';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function missing(d) {
  const m = [];
  if (!d.company) m.push('Company');
  if (!d.salesman_id) m.push('Salesman');
  if (!d.customer_category) m.push('Customer Category');
  if (!d.products || !d.products.length) m.push('Products');
  if (d.trn && !/^\d{15}$/.test(String(d.trn).replace(/\s/g, ''))) m.push('TRN (must be 15 digits)');
  return m;
}

export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const { ids } = await req.json();
  const results = [];
  for (const id of ids || []) {
    // Lock the row: only a draft can be claimed, so a double click can never create two CRM leads.
    const { data: claimed } = await db().from('drafts')
      .update({ status: 'pushed', pushed_by: auth.email, pushed_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'draft').select('*');
    const d = claimed && claimed[0];
    if (!d) { results.push({ id, ok: false, error: 'Not a draft any more (already sent or deleted)' }); continue; }

    const gaps = missing(d);
    if (gaps.length) {
      await db().from('drafts').update({ status: 'draft', pushed_at: null, pushed_by: null }).eq('id', id);
      results.push({ id, ok: false, error: `Fill in: ${gaps.join(', ')}` });
      continue;
    }
    try {
      const leadId = await crmCreateLead(d);
      await db().from('drafts').update({ crm_lead_id: leadId, push_error: null }).eq('id', id);
      results.push({ id, ok: true, crm_lead_id: leadId });
    } catch (e) {
      await db().from('drafts').update({ status: 'draft', pushed_at: null, pushed_by: null, push_error: e.message.slice(0, 500) }).eq('id', id);
      results.push({ id, ok: false, error: e.message });
    }
  }
  return json({ results });
}
