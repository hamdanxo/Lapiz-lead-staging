import { getSetting, setSetting } from './db';

const ACCOUNTS = () => process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const API = () => process.env.ZOHO_API_URL || 'https://www.zohoapis.com';
const MAIL = () => process.env.ZOHO_MAIL_URL || 'https://mail.zoho.com';

export const CRM_SCOPES = 'ZohoCRM.modules.leads.ALL,ZohoCRM.modules.attachments.CREATE,ZohoCRM.users.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.layouts.READ';
export const MAIL_SCOPES = 'ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ';

// One-time: swap the 10-minute "Generate Code" grant for a long-lived refresh token.
export async function connect(kind, { client_id, client_secret, code }) {
  // Reconnecting with only a new code: reuse the ID and secret already saved.
  if (!client_id || !client_secret) {
    const saved = await getSetting(`zoho_${kind}`);
    if (!saved) throw new Error('Client ID and Client Secret are needed the first time.');
    client_id = client_id || saved.client_id;
    client_secret = client_secret || saved.client_secret;
  }
  const url = `${ACCOUNTS()}/oauth/v2/token?` + new URLSearchParams({
    grant_type: 'authorization_code', client_id, client_secret, code,
  });
  const r = await fetch(url, { method: 'POST' });
  const j = await r.json();
  if (!j.refresh_token) {
    throw new Error(`Zoho did not return a refresh token (${j.error || 'unknown error'}). Generate a fresh code and try again within 10 minutes.`);
  }
  const conn = {
    client_id, client_secret,
    refresh_token: j.refresh_token,
    access_token: j.access_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60000,
  };
  await setSetting(`zoho_${kind}`, conn);
  return conn;
}

async function token(kind) {
  const conn = await getSetting(`zoho_${kind}`);
  if (!conn) throw new Error(`Zoho ${kind.toUpperCase()} is not connected yet. Open Settings and connect it.`);
  if (conn.access_token && conn.expires_at > Date.now()) return conn.access_token;
  const url = `${ACCOUNTS()}/oauth/v2/token?` + new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: conn.client_id,
    client_secret: conn.client_secret,
    refresh_token: conn.refresh_token,
  });
  const r = await fetch(url, { method: 'POST' });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Zoho ${kind} token refresh failed: ${j.error || r.status}`);
  conn.access_token = j.access_token;
  conn.expires_at = Date.now() + (j.expires_in || 3600) * 1000 - 60000;
  await setSetting(`zoho_${kind}`, conn);
  return conn.access_token;
}

async function call(kind, base, path, opts = {}) {
  const t = await token(kind);
  const r = await fetch(`${base}${path}`, {
    ...opts,
    headers: { Authorization: `Zoho-oauthtoken ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    cache: 'no-store',
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok && r.status !== 204) {
    const msg = body.message || body.code || (body.data && body.data[0] && body.data[0].message) || text.slice(0, 200);
    throw new Error(`Zoho ${kind} ${r.status}: ${msg}`);
  }
  return body;
}

// Like call(), but for file downloads/uploads (no JSON content type).
async function callRaw(kind, url, opts = {}) {
  const t = await token(kind);
  const r = await fetch(url, { ...opts, headers: { Authorization: `Zoho-oauthtoken ${t}`, ...(opts.headers || {}) }, cache: 'no-store' });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let msg = text.slice(0, 200);
    try { const j = JSON.parse(text); msg = j.message || j.code || (j.data && j.data[0] && (j.data[0].message || j.data[0].code)) || msg; } catch {}
    throw new Error(`Zoho ${kind} ${r.status}: ${msg}`);
  }
  return r;
}

// ---------- CRM ----------

export async function crmUsers() {
  const j = await call('crm', API(), '/crm/v8/users?type=ActiveConfirmedUsers&per_page=200');
  return (j.users || []).map((u) => ({
    id: u.id, name: u.full_name, email: u.email, role: u.role && u.role.name,
  }));
}

function picklist(fields, apiName) {
  const f = fields.find((x) => x.api_name === apiName);
  return f
    ? (f.pick_list_values || [])
        .map((v) => v.actual_value)
        .filter((v) => v && v !== '-None-')
    : [];
}

export const HIDDEN_PRODUCTS = ['Elevator', 'Forbo', 'Innobit', 'Tiles', 'Mosaics'];

export async function crmMeta() {
  const layoutId = process.env.ZOHO_LEAD_LAYOUT_ID;
  // Layout gives the layout-specific picklist values for custom fields.
  let fields = [];
  if (layoutId) {
    const j = await call('crm', API(), `/crm/v8/settings/layouts/${layoutId}?module=Leads`);
    const layout = (j.layouts || [])[0];
    fields = layout ? (layout.sections || []).flatMap((s) => s.fields || []) : [];
  }
  if (!fields.length) {
    const j = await call('crm', API(), '/crm/v8/settings/fields?module=Leads');
    fields = j.fields || [];
  }
  // Old CRM values kept for history (200+ old leads use Elevator) but hidden from the app.
  const hidden = new Set(HIDDEN_PRODUCTS.map((p) => p.toLowerCase()));
  return {
    customerCategories: picklist(fields, 'Customer_Category'),
    products: picklist(fields, 'Products').filter((p) => !hidden.has(p.toLowerCase())),
  };
}

export async function crmCreateLead(d) {
  const lead = {
    Company: d.company,
    Last_Name: d.contact_name || d.company,
    Lead_Source: d.source,
    Lead_Status: 'New Lead',
    Owner: { id: d.salesman_id },
    Approx_Quantity: d.approx_qty || null,
    TRN: d.trn || null,
    Customer_Category: d.customer_category,
    Products: d.products || [],
    Mobile: d.phone || null,
    Email: d.email || null,
    Description: [d.notes, d.raw_text && `Original message:\n${d.raw_text}`].filter(Boolean).join('\n\n') || null,
  };
  if (process.env.ZOHO_LEAD_LAYOUT_ID) lead.Layout = { id: process.env.ZOHO_LEAD_LAYOUT_ID };
  const j = await call('crm', API(), '/crm/v8/Leads', {
    method: 'POST',
    body: JSON.stringify({ data: [lead], trigger: ['workflow'] }),
  });
  const res = (j.data || [])[0] || {};
  if (res.status !== 'success') {
    const field = res.details && (res.details.api_name || JSON.stringify(res.details));
    throw new Error(`${res.message || 'CRM rejected the lead'}${field ? ` (${field})` : ''}`);
  }
  return res.details.id;
}

// Attach one file to a CRM lead. Returns the attachment id.
export async function crmAttachFile(leadId, name, buffer, mime) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), name);
  const r = await callRaw('crm', `${API()}/crm/v8/Leads/${leadId}/Attachments`, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  const res = (j.data || [])[0] || {};
  if (res.status !== 'success') throw new Error(res.message || res.code || 'CRM did not accept the file');
  return res.details && res.details.id;
}

// ---------- Mail ----------

export async function mailIds() {
  const conn = await getSetting('zoho_mail');
  if (conn && conn.account_id && conn.folder_id) return conn;
  const acc = await call('mail', MAIL(), '/api/accounts');
  const account = (acc.data || [])[0];
  if (!account) throw new Error('No Zoho Mail account found for this connection.');
  const fol = await call('mail', MAIL(), `/api/accounts/${account.accountId}/folders`);
  const folder = (fol.data || []).find((f) => String(f.folderName).toLowerCase() === 'leads');
  if (!folder) throw new Error('No folder called "Leads" found in Zoho Mail.');
  const fresh = await getSetting('zoho_mail');
  const updated = { ...fresh, account_id: account.accountId, folder_id: folder.folderId };
  await setSetting('zoho_mail', updated);
  return updated;
}

// Sent folder id is looked up once and remembered next to the Leads folder id.
async function sentFolderId() {
  const conn = await mailIds();
  if (conn.sent_folder_id) return conn;
  const fol = await call('mail', MAIL(), `/api/accounts/${conn.account_id}/folders`);
  const folder = (fol.data || []).find((f) => String(f.folderType || '').toLowerCase() === 'sent')
    || (fol.data || []).find((f) => String(f.folderName).toLowerCase() === 'sent');
  if (!folder) throw new Error('No Sent folder found in Zoho Mail.');
  const fresh = await getSetting('zoho_mail');
  const updated = { ...fresh, sent_folder_id: folder.folderId };
  await setSetting('zoho_mail', updated);
  return updated;
}

// Recent sent mail, used to spot leads Tarun already forwarded to a salesman.
export async function mailSent(limit = 200) {
  const { account_id, sent_folder_id } = await sentFolderId();
  const list = await call('mail', MAIL(), `/api/accounts/${account_id}/messages/view?folderId=${sent_folder_id}&limit=${limit}&sortorder=false`);
  return list.data || [];
}

export async function mailLeadsFolder(limit = 30) {
  const { account_id, folder_id } = await mailIds();
  const list = await call('mail', MAIL(), `/api/accounts/${account_id}/messages/view?folderId=${folder_id}&limit=${limit}&sortorder=false`);
  return { account_id, folder_id, messages: list.data || [] };
}

export async function mailContent(account_id, folder_id, message_id) {
  const j = await call('mail', MAIL(), `/api/accounts/${account_id}/folders/${folder_id}/messages/${message_id}/content`);
  return (j.data && j.data.content) || '';
}

export async function mailAttachmentInfo(account_id, folder_id, message_id) {
  const j = await call('mail', MAIL(), `/api/accounts/${account_id}/folders/${folder_id}/messages/${message_id}/attachmentinfo`);
  return (j.data && j.data.attachments) || [];
}

export async function mailAttachment(account_id, folder_id, message_id, attachment_id) {
  const r = await callRaw('mail', `${MAIL()}/api/accounts/${account_id}/folders/${folder_id}/messages/${message_id}/attachments/${attachment_id}`);
  return Buffer.from(await r.arrayBuffer());
}
