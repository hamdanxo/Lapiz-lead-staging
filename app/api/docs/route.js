import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';
import { BUCKET, MAX_BYTES, newPath, registerUpload, saveEmailDocs, trnFromDocs, pushDocsToCrm, docsWithLinks } from '@/lib/docs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function draftOf(id) {
  const { data } = await db().from('drafts').select('id,status,source,external_id,crm_lead_id').eq('id', id).maybeSingle();
  return data;
}

// Files on one or more drafts, with a 1 hour download link each.
export async function GET(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const ids = (new URL(req.url).searchParams.get('drafts') || '').split(',').filter(Boolean).slice(0, 200);
  return json({ docs: await docsWithLinks(ids) });
}

// { action: 'upload-url', draft_id, name, size }   -> where the browser should upload
// { action: 'register', draft_id, path, name, type } -> after the upload finished
// { action: 'sync', draft_id }                      -> copy the email's attachments again (and send to CRM if already pushed)
export async function POST(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const b = await req.json();
  const d = await draftOf(b.draft_id);
  if (!d) return json({ error: 'Draft not found' }, 404);

  try {
    if (b.action === 'upload-url') {
      if (Number(b.size) > MAX_BYTES) return json({ error: `${b.name} is bigger than 20 MB` }, 400);
      const path = newPath(d.id, b.name);
      const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(error.message);
      return json({ path, token: data.token });
    }

    let note = '';
    if (b.action === 'register') {
      await registerUpload({ draftId: d.id, path: String(b.path || ''), name: String(b.name || 'file').slice(0, 200), mime: b.type || null, user: auth.email });
    } else if (b.action === 'sync') {
      if (d.source !== 'Email' || !String(d.external_id || '').startsWith('email:')) return json({ error: 'Only email leads have email attachments' }, 400);
      const n = await saveEmailDocs(d.id, d.external_id.slice(6));
      note = n ? `${n} file${n > 1 ? 's' : ''} copied from the email.` : 'No new files in the email.';
    } else {
      return json({ error: 'Unknown action' }, 400);
    }

    const trn = await trnFromDocs(d.id);
    if (trn) note += ` TRN ${trn} found in the documents.`;
    // Already in the CRM? Send the new files straight to that lead.
    if (d.status === 'pushed' && d.crm_lead_id) {
      const r = await pushDocsToCrm(d.id, d.crm_lead_id);
      if (r.sent) note += ` ${r.sent} sent to the CRM lead.`;
      if (r.failed.length) note += ` Not sent to CRM: ${r.failed.join(', ')}`;
    }
    return json({ ok: true, note: note.trim(), trn });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

// Remove a file that has not gone to the CRM yet.
export async function DELETE(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const { id } = await req.json();
  const { data: doc } = await db().from('draft_docs').select('id,path,crm_attachment_id').eq('id', id).maybeSingle();
  if (!doc) return json({ error: 'File not found' }, 404);
  if (doc.crm_attachment_id) return json({ error: 'Already in the CRM, remove it there instead' }, 409);
  await db().storage.from(BUCKET).remove([doc.path]);
  await db().from('draft_docs').delete().eq('id', doc.id);
  return json({ ok: true });
}
