import { db, getSetting, setSetting } from './db';
import { nextInRotation, normCompany, samePhone, stripHtml, normalizeUaePhone, forwardedSalesman } from './text';
import { crmUsers, crmMeta, mailLeadsFolder, mailContent, mailSent } from './zoho';
import { parseLead } from './groq';
import { saveEmailDocs, docText, trnFromDocs } from './docs';

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
// If Tarun already forwarded that email to a salesman, that salesman gets the lead (no round robin).
export async function fetchEmail(users = []) {
  const { account_id, folder_id, messages } = await mailLeadsFolder(30);
  let sent = [];
  try { sent = await mailSent(200); } catch { /* still import, just without forward check */ }
  let added = 0;
  if (messages.length) {
    const ids = messages.map((m) => `email:${m.messageId}`);
    const { data: seen } = await db().from('drafts').select('external_id').in('external_id', ids);
    const seenSet = new Set((seen || []).map((s) => s.external_id));
    for (const m of messages) {
      const ext = `email:${m.messageId}`;
      if (seenSet.has(ext)) continue;
      let body = '';
      try { body = stripHtml(await mailContent(account_id, folder_id, m.messageId)); } catch { body = m.summary || ''; }
      const fwd = forwardedSalesman(m.subject, sent, users);
      const id = await insertDraft({
        source: 'Email',
        status: 'draft',
        external_id: ext,
        sender: m.fromAddress || m.sender,
        email: m.fromAddress || null,
        salesman_id: fwd ? fwd.id : null,
        raw_text: `Subject: ${m.subject || ''}\nFrom: ${m.sender || m.fromAddress || ''}${fwd ? `\nForwarded to: ${fwd.name}` : ''}\n\n${body}`.slice(0, 20000),
      });
      if (id) {
        added++;
        if (m.hasAttachment && m.hasAttachment !== '0') {
          try {
            await saveEmailDocs(id, m.messageId, { account_id, folder_id });
            await trnFromDocs(id);
          } catch (e) {
            await db().from('drafts').update({ push_error: `Could not copy the email attachments: ${e.message}`.slice(0, 300) }).eq('id', id);
          }
        }
      }
    }
  }
  // Forwarded after it was fetched? Re-check email drafts still waiting for review.
  if (sent.length && users.length) {
    const { data: open } = await db().from('drafts').select('id,raw_text,salesman_id').eq('source', 'Email').eq('status', 'draft');
    for (const d of open || []) {
      const subject = ((d.raw_text || '').match(/^Subject: (.*)$/m) || [])[1];
      const fwd = forwardedSalesman(subject, sent, users);
      if (!fwd || fwd.id === d.salesman_id) continue;
      const raw = /\nForwarded to: /.test(d.raw_text || '')
        ? d.raw_text.replace(/\nForwarded to: .*/, `\nForwarded to: ${fwd.name}`)
        : (d.raw_text || '').replace(/^(Subject: .*\n(?:From: .*)?)/, `$1\nForwarded to: ${fwd.name}`);
      await db().from('drafts').update({ salesman_id: fwd.id, raw_text: raw, updated_at: new Date().toISOString() }).eq('id', d.id);
    }
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
      const docs = await docText(d.id).catch(() => '');
      const input = docs ? `${(d.raw_text || '').slice(0, 3000)}\n\nAttached documents:\n${docs}` : d.raw_text;
      const out = input
        ? await parseLead(input, {
            categories: meta.customerCategories,
            products: meta.products,
            salesmen: users.map((u) => u.name),
          })
        : null;
      if (out) {
        for (const k of ['company', 'contact_name', 'phone', 'email', 'approx_qty', 'customer_category', 'notes']) {
          if (!d[k] && out[k]) patch[k] = String(out[k]).slice(0, 500);
        }
        // Same phone format as the counter form (+9715...), when it is a UAE number.
        if (patch.phone) patch.phone = normalizeUaePhone(patch.phone) || patch.phone;
        if ((!d.products || !d.products.length) && out.products && out.products.length) patch.products = out.products;
        // A salesman named in the message overrides the round robin pick.
        // A lead already forwarded to a salesman by email keeps that salesman.
        if (out.salesman && !/\nForwarded to: /.test(d.raw_text || '')) {
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
  try { report.email = await fetchEmail(users); } catch (e) { report.errors.push(`Email: ${e.message}`); }
  try { report.parsed = await enrichPending(users, meta); } catch (e) { report.errors.push(`AI pre-fill: ${e.message}`); }
  try { await flagDuplicates(); } catch (e) { report.errors.push(`Duplicate check: ${e.message}`); }
  if (users.length) { try { await salesmanNames(users); } catch {} }
  return report;
}
