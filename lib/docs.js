import { db } from './db';
import { findTrn, safeFileName } from './text';
import { mailIds, mailAttachmentInfo, mailAttachment, crmAttachFile } from './zoho';

export const BUCKET = 'lead-docs';
export const MAX_BYTES = 20 * 1024 * 1024; // the CRM accepts up to 20 MB per file

// Plain text from a PDF (or text file) so the AI and the TRN finder can read it.
// Scanned PDFs (photos of paper) have no text inside, so they return ''.
export async function extractText(buf, name = '', mime = '') {
  const lower = `${name} ${mime}`.toLowerCase();
  try {
    if (lower.includes('pdf')) {
      const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: true });
      return String(text || '').replace(/\s+\n/g, '\n').slice(0, 20000);
    }
    if (/\.(txt|csv)\b/.test(lower) || mime.startsWith('text/')) return buf.toString('utf8').slice(0, 20000);
  } catch { /* unreadable file: keep the file, skip the text */ }
  return '';
}

export function newPath(draftId, name) {
  return `${draftId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeFileName(name)}`;
}

// Save a file we already have in memory (email attachments).
export async function storeDoc({ draftId, name, mime, buf, source, user }) {
  const path = newPath(draftId, name);
  const up = await db().storage.from(BUCKET).upload(path, buf, { contentType: mime || 'application/octet-stream', upsert: false });
  if (up.error) throw new Error(`file save failed: ${up.error.message}`);
  const text = await extractText(buf, name, mime);
  const { data, error } = await db().from('draft_docs')
    .insert({ draft_id: draftId, name, mime, size: buf.length, path, source, text, created_by: user || null })
    .select('id').single();
  if (error) throw new Error(`file record failed: ${error.message}`);
  return data.id;
}

// Register a file the browser uploaded straight to storage.
export async function registerUpload({ draftId, path, name, mime, user }) {
  if (!path.startsWith(`${draftId}/`)) throw new Error('Wrong file path');
  const dl = await db().storage.from(BUCKET).download(path);
  if (dl.error) throw new Error('Upload not found, try again');
  const buf = Buffer.from(await dl.data.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    await db().storage.from(BUCKET).remove([path]);
    throw new Error('File is bigger than 20 MB');
  }
  const text = await extractText(buf, name, mime);
  const { error } = await db().from('draft_docs')
    .insert({ draft_id: draftId, name, mime, size: buf.length, path, source: 'upload', text, created_by: user || null });
  if (error) throw new Error(`file record failed: ${error.message}`);
}

// Copy every attachment of the lead's email into the app. Skips files already copied
// and small inline pictures (email signatures, logos).
export async function saveEmailDocs(draftId, messageId, ids) {
  const { account_id, folder_id } = ids || await mailIds();
  const list = await mailAttachmentInfo(account_id, folder_id, messageId);
  if (!list.length) return 0;
  const { data: have } = await db().from('draft_docs').select('name').eq('draft_id', draftId).eq('source', 'email');
  const haveNames = new Set((have || []).map((h) => h.name));
  let saved = 0;
  for (const a of list) {
    const name = a.attachmentName || 'attachment';
    const size = Number(a.attachmentSize || 0);
    const isImage = /\.(png|jpe?g|gif|bmp|webp)$/i.test(name);
    if (haveNames.has(name)) continue;
    if (size > MAX_BYTES) continue;
    if (isImage && size && size < 30 * 1024) continue;
    const buf = await mailAttachment(account_id, folder_id, messageId, a.attachmentId);
    await storeDoc({ draftId, name, mime: guessMime(name), buf, source: 'email', user: 'email' });
    saved++;
  }
  return saved;
}

function guessMime(name) {
  const ext = String(name).toLowerCase().split('.').pop();
  return ({
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  })[ext] || 'application/octet-stream';
}

// Text of all documents on a draft, for the AI pre-fill.
export async function docText(draftId, max = 3000) {
  const { data } = await db().from('draft_docs').select('name,text').eq('draft_id', draftId);
  const parts = (data || []).filter((d) => d.text).map((d) => `[${d.name}]\n${d.text}`);
  return parts.join('\n\n').slice(0, max);
}

// Fill an empty TRN from the documents (trade licence, VAT certificate).
export async function trnFromDocs(draftId) {
  const { data: d } = await db().from('drafts').select('trn,status').eq('id', draftId).maybeSingle();
  if (!d || d.trn || d.status === 'pushed') return null;
  const { data: docs } = await db().from('draft_docs').select('text').eq('draft_id', draftId);
  for (const doc of docs || []) {
    const trn = findTrn(doc.text);
    if (trn) {
      await db().from('drafts').update({ trn, updated_at: new Date().toISOString() }).eq('id', draftId);
      return trn;
    }
  }
  return null;
}

// Send documents that are not in the CRM yet. Returns { sent, failed: [names] }.
export async function pushDocsToCrm(draftId, leadId) {
  const { data: docs } = await db().from('draft_docs').select('*').eq('draft_id', draftId).is('crm_attachment_id', null);
  const out = { sent: 0, failed: [] };
  for (const doc of docs || []) {
    try {
      const dl = await db().storage.from(BUCKET).download(doc.path);
      if (dl.error) throw new Error(dl.error.message);
      const buf = Buffer.from(await dl.data.arrayBuffer());
      const attId = await crmAttachFile(leadId, doc.name, buf, doc.mime);
      await db().from('draft_docs').update({ crm_attachment_id: attId || 'sent' }).eq('id', doc.id);
      out.sent++;
    } catch (e) {
      out.failed.push(`${doc.name} (${e.message.slice(0, 120)})`);
    }
  }
  return out;
}

export async function listDocs(draftIds) {
  if (!draftIds.length) return [];
  const { data } = await db().from('draft_docs')
    .select('id,draft_id,name,mime,size,source,crm_attachment_id,created_at')
    .in('draft_id', draftIds).order('created_at', { ascending: true });
  return data || [];
}
