import { db, getSetting, setSetting } from './db';
import { nextInRotation, normCompany, samePhone, stripHtml } from './text';
import { crmUsers, crmMeta, mailLeadsFolder, mailContent } from './zoho';
import { parseLead } from './groq';

// Insert a new draft. Skips silently if the same message was already stored.
export async function insertDraft(row) {
  const record = { ...row };
  if (record.status !== 'filtered' && !record.salesman_id) {
    const rot = await getSetting('rotation', { ids: [], next: 0 });
    const pick = nextInRotation(rot);
    if (pick.id) {
      record.salesman_id = pick.id;
      await setSetting('rotation', pick.rotation);
    }
  }
  const { data, error } = await db()
    .from('drafts')
    .upsert(record, { onConflict: 'external_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`could not save draft: ${error.message}`);
  return data && data[0] ? data[0].id : null;
}

// Pull every email in the Zoho Mail "Leads" folder that we have not stored yet.
export async function fetchEmail() {
  const { account_id, folder_id, messages } = await mailLeadsFolder(30);
  if (!messages.length) return 0;
  const ids = messages.map((m) => `email:${m.messageId}`);
  const { data: seen } = await db().from('drafts').select('external_id').in('external_id', ids);
  const seenSet = new Set((seen || []).map((s) => s.external_id));
  let added = 0;
  for (const m of messages) {
    const ext = `email:${m.messageId}`;
    if (seenSet.has(ext)) continue;
    let body = '';
    try { body = stripHtml(await mailContent(account_id, folder_id, m.messageId)); } catch { body = m.summary || ''; }
    const id = await insertDraft({
      source: 'Email',
      status: 'draft',
      external_id: ext,
      sender: m.fromAddress || m.sender,
      email: m.fromAddress || null,
      raw_text: `Subject: ${m.subject || ''}\nFrom: ${m.sender || m.fromAddress || ''}\n\n${body}`.slice(0, 20000),
    });
    if (id) added++;
  }
  return added;
}

// Fill blanks on unparsed drafts using Groq, then flag possible duplicates.
export async function enrichPending(users, meta, max = 15) {
  const { data: pending } = await db()
    .from('drafts').select('*').eq('status', 'draft').eq('parsed', false)
    .order('created_at', { ascending: true }).limit(max);
  let parsed = 0;
  for (const d of pending || []) {
    const patch = { parsed: true, updated_at: new Date().toISOString() };
    try {
      const out = d.raw_text
        ? await parseLead(d.raw_text, {
            categories: meta.customerCategories,
            products: meta.products,
            salesmen: users.map((u) => u.name),
          })
        : null;
      if (out) {
        for (const k of ['company', 'contact_name', 'phone', 'email', 'approx_qty', 'customer_category', 'notes']) {
          if (!d[k] && out[k]) patch[k] = String(out[k]).slice(0, 500);
        }
        if ((!d.products || !d.products.length) && out.products && out.products.length) patch.products = out.products;
        // A salesman named in the message overrides the round robin pick.
        if (out.salesman) {
          const hit = users.find((u) => u.name.toLowerCase().includes(String(out.salesman).toLowerCase().split(' ')[0]));
          if (hit) patch.salesman_id = hit.id;
        }
        parsed++;
      }
    } catch (e) {
      patch.parsed = false; // try again on the next fetch
      patch.push_error = `AI pre-fill skipped: ${e.message}`.slice(0, 300);
    }
    if (!d.phone && !patch.phone && d.source !== 'Email' && d.sender) patch.phone = d.sender;
    await db().from('drafts').update(patch).eq('id', d.id);
  }
  return parsed;
}

export async function flagDuplicates() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data } = await db()
    .from('drafts').select('id,company,phone,status,created_at,source')
    .in('status', ['draft', 'pushed']).gte('created_at', since)
    .order('created_at', { ascending: true });
  const rows = data || [];
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (a.status !== 'draft') continue;
    const twin = rows.slice(0, i).find((b) =>
      (a.phone && samePhone(a.phone, b.phone)) ||
      (normCompany(a.company) && normCompany(a.company) === normCompany(b.company)));
    const warn = twin
      ? `Looks like a repeat of a ${twin.source} lead from ${new Date(twin.created_at).toLocaleDateString('en-GB')}${twin.status === 'pushed' ? ' (already in CRM)' : ''}`
      : null;
    await db().from('drafts').update({ dup_warning: warn }).eq('id', a.id);
  }
}

export async function salesmanNames(users) {
  const map = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const { data } = await db().from('drafts').select('id,salesman_id,salesman_name').eq('status', 'draft');
  for (const d of data || []) {
    const name = d.salesman_id ? map[d.salesman_id] || null : null;
    if (name !== d.salesman_name) await db().from('drafts').update({ salesman_name: name }).eq('id', d.id);
  }
}

// The whole "Fetch leads" run. Each step reports its own result so one failure doesn't hide the rest.
export async function runFetch() {
  const report = { email: null, parsed: 0, errors: [] };
  let users = [];
  let meta = { customerCategories: [], products: [] };
  try { users = await crmUsers(); } catch (e) { report.errors.push(`CRM users: ${e.message}`); }
  try { meta = await crmMeta(); } catch (e) { report.errors.push(`CRM options: ${e.message}`); }
  try { report.email = await fetchEmail(); } catch (e) { report.errors.push(`Email: ${e.message}`); }
  try { report.parsed = await enrichPending(users, meta); } catch (e) { report.errors.push(`AI pre-fill: ${e.message}`); }
  try { await flagDuplicates(); } catch (e) { report.errors.push(`Duplicate check: ${e.message}`); }
  if (users.length) { try { await salesmanNames(users); } catch {} }
  return report;
}
