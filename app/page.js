'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const CRM_LEAD_URL = 'https://crm.zoho.com/crm/org719219149/tab/Leads/';
const TABS = [
  { key: 'draft', label: 'Drafts' },
  { key: 'filtered', label: 'Filtered out' },
  { key: 'pushed', label: 'Sent to CRM' },
  { key: 'reports', label: 'Reports' },
];
const SOURCES = ['Mayur', 'WhatsApp', 'Email', 'Counter'];
const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'pick_month', label: 'Pick a month' },
  { key: 'pick_year', label: 'Pick a year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom dates' },
];

function missing(d) {
  const m = [];
  if (!d.company) m.push('company');
  if (!d.salesman_id) m.push('salesman_id');
  if (!d.customer_category) m.push('customer_category');
  if (!d.products || !d.products.length) m.push('products');
  return m;
}

function when(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Reports are counted in Dubai time, so the dates on screen are shown in Dubai time too.
function dubaiDay(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric' });
}

// Today in Dubai as 2026-10-13, which is what the month and date boxes expect.
function dubaiToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('Signed out'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export default function Home() {
  const [tab, setTab] = useState('draft');
  const [drafts, setDrafts] = useState([]);
  const [counts, setCounts] = useState({});
  const [meta, setMeta] = useState({ users: [], customerCategories: [], products: [], connected: {}, errors: [] });
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [docsBy, setDocsBy] = useState({});
  const [sort, setSort] = useState('new'); // newest or oldest first in the three lead lists

  const groupDocs = (docs) => {
    const by = {};
    for (const doc of docs || []) (by[doc.draft_id] = by[doc.draft_id] || []).push(doc);
    return by;
  };

  // Leads, counts and their files come back in one request. Reports has its own route.
  const load = useCallback(async (t = tab) => {
    if (t === 'reports') return;
    const j = await api(`/api/drafts?status=${t}&sort=${sort}`);
    setDrafts(j.drafts || []);
    setCounts(j.counts || {});
    setDocsBy(groupDocs(j.docs));
  }, [tab, sort]);

  const loadMeta = useCallback(async (fresh = false) => {
    try { setMeta(await api(`/api/meta${fresh ? '?fresh=1' : ''}`)); } catch (e) { setNotice({ bad: true, text: e.message }); }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { setSelected(new Set()); load(tab).catch((e) => setNotice({ bad: true, text: e.message })); }, [tab, load]);

  const salesmen = useMemo(() => {
    const reps = meta.users.filter((u) => u.role === 'Sales Rep');
    const rest = meta.users.filter((u) => u.role !== 'Sales Rep');
    return [...reps, ...rest];
  }, [meta.users]);

  async function fetchLeads() {
    setBusy('fetch'); setNotice(null);
    try {
      const r = await api('/api/fetch', { method: 'POST' });
      await load('draft'); setTab('draft');
      const parts = [];
      if (r.email !== null) parts.push(`${r.email} new email${r.email === 1 ? '' : 's'}`);
      parts.push(`${r.parsed} pre-filled by AI`);
      setNotice({ bad: r.errors.length > 0, text: `Fetched: ${parts.join(', ')}.${r.errors.length ? ' Problems: ' + r.errors.join(' | ') : ''}` });
    } catch (e) { setNotice({ bad: true, text: e.message }); }
    setBusy('');
  }

  function patchLocal(id, fields) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...fields } : d)));
  }

  async function save(id, fields) {
    patchLocal(id, fields);
    try { await api('/api/drafts', { method: 'PATCH', body: JSON.stringify({ id, fields }) }); }
    catch (e) { setNotice({ bad: true, text: `Not saved: ${e.message}` }); }
  }

  async function setStatus(id, action) {
    const before = drafts;
    setDrafts((ds) => ds.filter((d) => d.id !== id)); // gone from the screen straight away
    try {
      await api('/api/drafts', { method: 'PATCH', body: JSON.stringify({ id, action }) });
      load().catch(() => {});
    } catch (e) { setDrafts(before); setNotice({ bad: true, text: e.message }); }
  }

  // Move leads to another tab. From Sent to CRM this is a recall: the CRM lead is deleted too.
  async function move(ids, to, confirmText) {
    if (!ids.length) return;
    if (confirmText && !confirm(confirmText)) return;
    const before = drafts;
    setDrafts((ds) => ds.filter((d) => !ids.includes(d.id)));
    setSelected(new Set());
    try {
      const { results } = await api('/api/drafts', { method: 'PATCH', body: JSON.stringify({ action: 'move', ids, to }) });
      const ok = results.filter((r) => r.ok).length;
      const bad = results.filter((r) => !r.ok);
      await load();
      const where = to === 'draft' ? 'Drafts' : 'Filtered out';
      setNotice({
        bad: bad.length > 0,
        text: `${ok} moved to ${where}.${bad.length ? ` ${bad.length} not moved: ${bad.map((b) => b.error).join(' | ')}` : ''}`,
      });
    } catch (e) { setDrafts(before); setNotice({ bad: true, text: e.message }); }
  }

  const recallText = (n, name) =>
    `Recall ${n === 1 ? `"${name}"` : `${n} leads`}? This deletes ${n === 1 ? 'the lead' : 'them'} from Zoho CRM (Zoho keeps deleted leads in its Recycle Bin for 60 days) and brings ${n === 1 ? 'it' : 'them'} back here so you can fix and push again. Emails Zoho already sent to the salesman cannot be undone.`;

  async function push(ids) {
    if (!ids.length) return;
    setBusy('push'); setNotice(null);
    try {
      const { results } = await api('/api/push', { method: 'POST', body: JSON.stringify({ ids }) });
      const ok = results.filter((r) => r.ok).length;
      const bad = results.filter((r) => !r.ok);
      await load();
      setSelected(new Set());
      setNotice({
        bad: bad.length > 0,
        text: `${ok} sent to Zoho CRM.${bad.length ? ` ${bad.length} not sent: ${bad.map((b) => b.error).join(' | ')}` : ''}`,
      });
    } catch (e) { setNotice({ bad: true, text: e.message }); }
    setBusy('');
  }

  async function removeSent(ids) {
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} lead${ids.length > 1 ? 's' : ''} from this list? They stay in Zoho CRM.`)) return;
    const before = drafts;
    setDrafts((ds) => ds.filter((d) => !ids.includes(d.id)));
    setSelected(new Set());
    try {
      const r = await api('/api/drafts', { method: 'PATCH', body: JSON.stringify({ action: 'remove_sent', ids }) });
      setNotice({ bad: false, text: `${r.removed} removed from the list. They are still in Zoho CRM.` });
      load().catch(() => {});
    } catch (e) { setDrafts(before); setNotice({ bad: true, text: e.message }); }
  }

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const ready = drafts.filter((d) => !missing(d).length);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page">
      <header className="top">
        <div className="brand"><img src="/lapiz-logo-white.svg" alt="Lapiz Blue" className="logo" /><span className="sep" />Lead Staging</div>
        <div className="top-actions">
          <button className="btn primary" onClick={fetchLeads} disabled={!!busy}>{busy === 'fetch' ? 'Fetching…' : 'Fetch leads'}</button>
          <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {(meta.connected.crm === false || meta.connected.mail === false) && (
        <div className="alert warn">
          {meta.connected.crm === false && 'Zoho CRM is not connected yet. '}
          {meta.connected.mail === false && 'Zoho Mail is not connected yet. '}
          <button className="link" onClick={() => setShowSettings(true)}>Open Settings to connect</button>
        </div>
      )}
      {notice && <div className={`alert ${notice.bad ? 'bad' : 'good'}`}>{notice.text}<button className="x" onClick={() => setNotice(null)}>×</button></div>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="count">{counts[t.key] ?? ''}</span>
          </button>
        ))}
      </nav>

      {tab === 'reports' ? (
        <Reports meta={meta} onNotice={setNotice} />
      ) : (
        <>
          {drafts.length > 0 && (
            <div className="listbar">
              <span className="muted small">{tab === 'pushed' ? 'By the date sent to CRM' : 'By the date the lead came in'}</span>
              <button className="link" title="Change the order" onClick={() => setSort(sort === 'new' ? 'old' : 'new')}>
                {sort === 'new' ? 'Newest first' : 'Oldest first'} ⇅
              </button>
            </div>
          )}

          {tab === 'draft' && drafts.length > 0 && (
            <div className="bulk">
              <label className="check">
                <input type="checkbox"
                  checked={ready.length > 0 && ready.every((d) => selected.has(d.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(ready.map((d) => d.id)) : new Set())} />
                Select all ready ({ready.length})
              </label>
              <button className="btn primary" disabled={!selected.size || !!busy} onClick={() => push([...selected])}>
                {busy === 'push' ? 'Sending…' : `Push ${selected.size || ''} to CRM`}
              </button>
            </div>
          )}

          {tab === 'pushed' && drafts.length > 0 && (
            <div className="bulk">
              <label className="check">
                <input type="checkbox"
                  checked={drafts.length > 0 && drafts.every((d) => selected.has(d.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())} />
                Select all ({drafts.length})
              </label>
              <button className="btn primary" disabled={!selected.size} onClick={() => move([...selected], 'draft', recallText(selected.size))}>
                {`Recall ${selected.size || ''} to Drafts`}
              </button>
              <button className="btn danger" disabled={!selected.size} onClick={() => removeSent([...selected])}>
                {`Remove ${selected.size || ''} from list`}
              </button>
            </div>
          )}

          <section className="list">
            {drafts.length === 0 && <div className="empty">{tab === 'draft' ? 'No drafts waiting. Press Fetch leads to check for new ones.' : 'Nothing here.'}</div>}
            {drafts.map((d) =>
              tab === 'draft' ? (
                <DraftCard key={d.id} d={d} meta={meta} salesmen={salesmen}
                  selected={selected.has(d.id)} onToggle={() => toggle(d.id)}
                  onLocal={(f) => patchLocal(d.id, f)} onSave={(f) => save(d.id, f)}
                  onDelete={() => confirm('Delete this draft? It will not go to CRM.') && setStatus(d.id, 'delete')}
                  onFilter={() => move([d.id], 'filtered')}
                  onPush={() => push([d.id])} busy={!!busy}
                  docs={docsBy[d.id] || []} onDocs={() => load()} onNotice={setNotice} />
              ) : tab === 'filtered' ? (
                <div className="card" key={d.id}>
                  <div className="card-head"><span className={`pill ${d.source}`}>{d.source}</span><span className="muted">{d.sender ? `+${d.sender}` : ''} · {when(d.created_at)}</span></div>
                  <pre className="raw">{d.raw_text}</pre>
                  <div className="row-end"><button className="btn" onClick={() => move([d.id], 'draft')}>Move to Drafts</button></div>
                </div>
              ) : (
                <div className={`card sent ${selected.has(d.id) ? 'picked' : ''}`} key={d.id}>
                  <div className="card-head">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} title="Select" />
                    <span className={`pill ${d.source}`}>{d.source}</span>
                    <strong>{d.company}</strong>
                    <span className="muted">→ {d.salesman_name || 'salesman'} · {when(d.pushed_at)} by {d.pushed_by}</span>
                    {d.crm_lead_id && <a className="link" href={CRM_LEAD_URL + d.crm_lead_id} target="_blank" rel="noreferrer">Open in CRM</a>}
                  </div>
                  {d.push_error && <div className="alert warn small">{d.push_error}</div>}
                  <Docs d={d} docs={docsBy[d.id] || []} onDocs={() => load()} onNotice={setNotice} sent />
                  <div className="row-end">
                    <button className="btn ghost" onClick={() => move([d.id], 'filtered', recallText(1, d.company))}>Recall to Filtered out</button>
                    <button className="btn" onClick={() => move([d.id], 'draft', recallText(1, d.company))}>Recall to Drafts</button>
                  </div>
                </div>
              )
            )}
          </section>
        </>
      )}

      {showSettings && <Settings meta={meta} salesmen={salesmen} onClose={() => { setShowSettings(false); loadMeta(true); }} />}
    </div>
  );
}

function DraftCard({ d, meta, salesmen, selected, onToggle, onLocal, onSave, onDelete, onFilter, onPush, busy, docs, onDocs, onNotice }) {
  const [open, setOpen] = useState(false);
  const gaps = missing(d);
  const text = (k, label, props = {}) => (
    <label className={gaps.includes(k) ? 'need' : ''}>{label}
      <input value={d[k] || ''} onChange={(e) => onLocal({ [k]: e.target.value })} onBlur={(e) => onSave({ [k]: e.target.value.trim() || null })} {...props} />
    </label>
  );
  const toggleProduct = (p) => {
    const cur = d.products || [];
    onSave({ products: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };
  const userName = (id) => (salesmen.find((u) => u.id === id) || {}).name || null;

  return (
    <div className={`card ${selected ? 'picked' : ''}`}>
      <div className="card-head">
        <input type="checkbox" checked={selected} disabled={gaps.length > 0} onChange={onToggle} title={gaps.length ? 'Fill the red fields first' : 'Select'} />
        <select className={`pill ${d.source}`} value={d.source} onChange={(e) => onSave({ source: e.target.value })}>
          {['Mayur', 'WhatsApp', 'Email', 'Counter'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="muted">{d.sender && d.source !== 'Counter' ? `${d.source === 'Email' ? '' : '+'}${d.sender} · ` : ''}{when(d.created_at)}</span>
        {!d.parsed && d.raw_text && <span className="tag">AI pending</span>}
      </div>
      {d.dup_warning && <div className="alert warn small">{d.dup_warning}</div>}
      {d.push_error && <div className="alert bad small">{d.push_error}</div>}

      <div className="grid">
        {text('company', 'Company *')}
        <label className={gaps.includes('salesman_id') ? 'need' : ''}>Salesman *
          <select value={d.salesman_id || ''} onChange={(e) => onSave({ salesman_id: e.target.value || null, salesman_name: userName(e.target.value) })}>
            <option value="">Pick a salesman</option>
            {salesmen.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role && u.role !== 'Sales Rep' ? ` (${u.role})` : ''}</option>)}
          </select>
        </label>
        {text('approx_qty', 'Approx quantity')}
        <label className={gaps.includes('customer_category') ? 'need' : ''}>Customer category *
          <select value={d.customer_category || ''} onChange={(e) => onSave({ customer_category: e.target.value || null })}>
            <option value="">Pick a category</option>
            {meta.customerCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        {text('contact_name', 'Contact person')}
        {text('phone', 'Phone')}
        {text('email', 'Email', { type: 'email' })}
        {text('trn', 'TRN', { inputMode: 'numeric', maxLength: 15 })}
        {text('notes', 'Notes / potential')}
      </div>

      <div className={`products ${gaps.includes('products') ? 'need' : ''}`}>
        <span className="label">Products *</span>
        <div className="chips">
          {meta.products.map((p) => (
            <button type="button" key={p} className={`chip ${(d.products || []).includes(p) ? 'on' : ''}`} onClick={() => toggleProduct(p)}>{p}</button>
          ))}
          {!meta.products.length && <span className="muted">Connect Zoho CRM to load products</span>}
        </div>
      </div>

      <Docs d={d} docs={docs} onDocs={onDocs} onNotice={onNotice} />

      {d.raw_text && (
        <div>
          <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} original message</button>
          {open && <pre className="raw">{d.raw_text}</pre>}
        </div>
      )}

      <div className="row-end">
        <button className="btn ghost" onClick={onFilter}>Move to Filtered out</button>
        <button className="btn ghost danger" onClick={onDelete}>Delete</button>
        <button className="btn primary" disabled={gaps.length > 0 || busy} onClick={onPush}>
          {gaps.length ? `Fill ${gaps.length} field${gaps.length > 1 ? 's' : ''}` : 'Push to CRM'}
        </button>
      </div>
    </div>
  );
}

function size(n) {
  if (!n) return '';
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

// Files on a lead: copied from the email automatically, or dropped in by hand.
function Docs({ d, docs, onDocs, onNotice, sent = false }) {
  const [over, setOver] = useState(false);
  const [work, setWork] = useState('');
  const inputId = `files-${d.id}`;
  const isEmail = d.source === 'Email' && String(d.external_id || '').startsWith('email:');

  async function upload(files) {
    const list = [...files];
    if (!list.length) return;
    const notes = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setWork(`Uploading ${i + 1} of ${list.length}: ${f.name}`);
      try {
        if (f.size > 20 * 1024 * 1024) throw new Error('bigger than 20 MB');
        const { path, token } = await api('/api/docs', { method: 'POST', body: JSON.stringify({ action: 'upload-url', draft_id: d.id, name: f.name, size: f.size }) });
        const up = await supabaseBrowser().storage.from('lead-docs').uploadToSignedUrl(path, token, f, { contentType: f.type || 'application/octet-stream' });
        if (up.error) throw new Error(up.error.message);
        const r = await api('/api/docs', { method: 'POST', body: JSON.stringify({ action: 'register', draft_id: d.id, path, name: f.name, type: f.type }) });
        if (r.note) notes.push(r.note);
      } catch (e) { notes.push(`${f.name} not added: ${e.message}`); }
    }
    setWork('');
    if (notes.length) onNotice({ bad: notes.some((n) => n.includes('not added') || n.includes('Not sent')), text: notes.join(' ') });
    onDocs();
  }

  async function fromEmail() {
    setWork('Getting files from the email…');
    try {
      const r = await api('/api/docs', { method: 'POST', body: JSON.stringify({ action: 'sync', draft_id: d.id }) });
      onNotice({ bad: (r.note || '').includes('Not sent'), text: r.note || 'Done.' });
    } catch (e) { onNotice({ bad: true, text: e.message }); }
    setWork('');
    onDocs();
  }

  async function remove(doc) {
    try { await api('/api/docs', { method: 'DELETE', body: JSON.stringify({ id: doc.id }) }); onDocs(); }
    catch (e) { onNotice({ bad: true, text: e.message }); }
  }

  return (
    <div className="docs">
      <div className="docs-head">
        <span className="label">Documents{docs.length ? ` (${docs.length})` : ''}</span>
        {isEmail && <button type="button" className="link" disabled={!!work} onClick={fromEmail}>Get files from email</button>}
      </div>
      {docs.length > 0 && (
        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.id}>
              <a href={doc.url || '#'} target="_blank" rel="noreferrer">{doc.name}</a>
              <span className="muted small">{size(doc.size)}</span>
              <span className={`tag ${doc.source === 'email' ? '' : 'ok'}`}>{doc.source === 'email' ? 'from email' : 'added'}</span>
              {doc.crm_attachment_id && <span className="tag ok">in CRM</span>}
              {!doc.crm_attachment_id && <button type="button" className="x small-x" title="Remove" onClick={() => remove(doc)}>×</button>}
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={inputId}
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        {work || (sent ? 'Drop files here to add them to the CRM lead, or click to choose' : 'Drop files here (trade licence, VAT certificate, BOQ…) or click to choose')}
        <input id={inputId} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </label>
    </div>
  );
}

function Settings({ meta, salesmen, onClose }) {
  const [s, setS] = useState(null);
  const [rot, setRot] = useState([]);
  const [kw, setKw] = useState('');
  const [mayur, setMayur] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api('/api/settings').then((j) => {
      setS(j);
      setRot(j.rotation.ids || []);
      setKw((j.keywords || []).join(', '));
      setMayur((j.mayur_numbers || []).join(', '));
    }).catch((e) => setMsg({ bad: true, text: e.message }));
  }, []);

  async function saveAll() {
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({
        rotation_ids: rot,
        keywords: kw.split(',').map((x) => x.trim()).filter(Boolean),
        mayur_numbers: mayur.split(',').map((x) => x.trim()).filter(Boolean),
      }) });
      setMsg({ bad: false, text: 'Saved.' });
    } catch (e) { setMsg({ bad: true, text: e.message }); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h2>Settings</h2><button className="x" onClick={onClose}>×</button></div>

        <h3>Zoho connections</h3>
        <ConnectBox kind="crm" title="Zoho CRM" connected={meta.connected.crm}
          help="Use a Self Client created while logged in as a CRM admin (e.g. Adil)."
          scopes="ZohoCRM.modules.leads.ALL,ZohoCRM.modules.attachments.CREATE,ZohoCRM.users.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.layouts.READ" />
        <ConnectBox kind="mail" title="Zoho Mail (Leads folder)" connected={meta.connected.mail}
          help="Use a Self Client created while logged in as tarun.s@lapizblue.com, because it reads that inbox."
          scopes="ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ" />

        {!s ? <p className="muted">Loading…</p> : (
          <>
            <h3>Round robin salesmen</h3>
            <p className="muted small">New leads with no salesman named are handed out in turn to the ticked people. You can always change it on the draft.</p>
            <div className="checks">
              {salesmen.map((u) => (
                <label key={u.id} className="check">
                  <input type="checkbox" checked={rot.includes(u.id)}
                    onChange={(e) => setRot(e.target.checked ? [...rot, u.id] : rot.filter((x) => x !== u.id))} />
                  {u.name} <span className="muted small">{u.role}</span>
                </label>
              ))}
              {!salesmen.length && <span className="muted">Connect Zoho CRM first to load salesmen.</span>}
            </div>

            <h3>WhatsApp keywords</h3>
            <p className="muted small">A WhatsApp message (not from Mayur) becomes a draft only if it contains one of these words. Others go to Filtered out.</p>
            <textarea rows={4} value={kw} onChange={(e) => setKw(e.target.value)} />

            <h3>Mayur&apos;s WhatsApp numbers</h3>
            <p className="muted small">Messages from these numbers become a lead only when they contain /lead. Anything he sends in the next 10 minutes is added to that lead. His normal chat is never saved.</p>
            <input value={mayur} onChange={(e) => setMayur(e.target.value)} />

            {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
            <div className="row-end"><button className="btn primary" onClick={saveAll}>Save settings</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function ConnectBox({ kind, title, connected, help, scopes }) {
  const [open, setOpen] = useState(!connected);
  const [f, setF] = useState({ client_id: '', client_secret: '', code: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function go(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/api/connect', { method: 'POST', body: JSON.stringify({ kind, ...f }) });
      setMsg({ bad: false, text: 'Connected.' });
      setF({ client_id: '', client_secret: '', code: '' });
    } catch (err) { setMsg({ bad: true, text: err.message }); }
    setBusy(false);
  }

  return (
    <div className="connect">
      <div className="connect-head">
        <strong>{title}</strong>
        <span className={`tag ${connected ? 'ok' : ''}`}>{connected ? 'Connected' : 'Not connected'}</span>
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : connected ? 'Reconnect' : 'Connect'}</button>
      </div>
      {open && (
        <form onSubmit={go}>
          <p className="muted small">{help} In the API Console, Self Client &gt; Generate Code, paste these scopes, pick 10 minutes, then paste the code below right away.</p>
          <code className="scopes">{scopes}</code>
          {connected && <p className="muted small">Already connected: leave Client ID and Secret empty to keep the saved ones, and only paste the new code.</p>}
          <label>Client ID<input value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required={!connected} /></label>
          <label>Client Secret<input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} required={!connected} /></label>
          <label>Generated code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></label>
          {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
        </form>
      )}
    </div>
  );
}

const pct = (n, max) => (n ? Math.max(2, Math.round((n / max) * 100)) : 0);

// The Reports tab. It only counts leads already sent to CRM, by the day the lead came in.
// All the counting happens in /api/reports; this picks the period and shows the numbers.
function Reports({ meta, onNotice }) {
  const [period, setPeriod] = useState('month');
  const [month, setMonth] = useState(dubaiToday().slice(0, 7));
  const [year, setYear] = useState(dubaiToday().slice(0, 4));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [f, setF] = useState({ salesman: '', brand: '', source: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (period === 'pick_month') p.set('month', month);
    if (period === 'pick_year') p.set('year', year);
    if (period === 'custom') { if (from) p.set('from', from); if (to) p.set('to', to); }
    for (const k of ['salesman', 'brand', 'source']) if (f[k]) p.set(k, f[k]);
    return p.toString();
  }, [period, month, year, from, to, f]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    api(`/api/reports?${query}`)
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message); setData(null); setLoading(false); } });
    return () => { alive = false; }; // a slow answer must not overwrite a newer one
  }, [query]);

  // The dropdowns list the CRM values plus whatever turns up in the report, so a salesman who
  // has left, or a brand hidden in the app, can still be picked.
  const options = useMemo(() => {
    const union = (a, b) => [...new Set([...(a || []), ...(b || [])])]
      .filter((x) => x && !x.startsWith('No '))
      .sort((x, y) => x.localeCompare(y));
    return {
      salesmen: union(meta.users.map((u) => u.name), ((data && data.bySalesman) || []).map((r) => r.name)),
      brands: union(meta.products, ((data && data.byBrand) || []).map((r) => r.name)),
    };
  }, [meta, data]);

  const years = useMemo(() => {
    const thisYear = Number(dubaiToday().slice(0, 4));
    return Array.from({ length: 6 }, (_, i) => String(thisYear - i));
  }, []);

  async function exportCsv() {
    setCsvBusy(true);
    try {
      const res = await fetch(`/api/reports?${query}&format=csv`);
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `lapiz-leads-${dubaiToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { onNotice({ bad: true, text: e.message }); }
    setCsvBusy(false);
  }

  const r = data || {};
  const chosen = [f.salesman, f.brand, f.source].filter(Boolean);
  const pickFilter = (k, name) => setF((cur) => ({ ...cur, [k]: cur[k] === name ? '' : name }));
  const maxMonth = Math.max(1, ...(r.byMonth || []).map((m) => m.count));

  return (
    <section className="report">
      <div className="card">
        <div className="chips">
          {PERIODS.map((p) => (
            <button type="button" key={p.key} className={`chip ${period === p.key ? 'on' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>

        {period === 'pick_month' && (
          <div className="rrow">
            <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          </div>
        )}
        {period === 'pick_year' && (
          <div className="rrow">
            <label>Year
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          </div>
        )}
        {period === 'custom' && (
          <div className="rrow">
            <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}

        <div className="rrow">
          <label>Salesman
            <select value={f.salesman} onChange={(e) => setF({ ...f, salesman: e.target.value })}>
              <option value="">All salesmen</option>
              {options.salesmen.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>Brand
            <select value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}>
              <option value="">All brands</option>
              {options.brands.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>Source
            <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
              <option value="">All sources</option>
              {SOURCES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          {chosen.length > 0 && <button className="link" onClick={() => setF({ salesman: '', brand: '', source: '' })}>Clear filters</button>}
        </div>
      </div>

      {err && <div className="alert bad">{err}</div>}

      <div className="card stat">
        <span className="n">{loading ? '…' : r.total || 0}</span>
        <span className="stat-text">
          <strong>lead{r.total === 1 ? '' : 's'} sent to CRM</strong>
          <span className="muted small">{(r.range && r.range.label) || ''}{chosen.length ? ` · ${chosen.join(' · ')}` : ''}</span>
        </span>
        <button className="btn" disabled={csvBusy || loading || !r.total} onClick={exportCsv}>{csvBusy ? 'Preparing…' : 'Export CSV'}</button>
      </div>

      <div className="cards2">
        <CountTable title="By salesman" head="Salesman" note="Click a row to show only that salesman."
          rows={r.bySalesman} loading={loading} active={f.salesman} onPick={(n) => pickFilter('salesman', n)} />
        <CountTable title="By brand" head="Brand" note="One lead can have several brands, so these add up to more than the total. Click a row to show only that brand."
          rows={r.byBrand} loading={loading} active={f.brand} onPick={(n) => pickFilter('brand', n)} />
      </div>

      <div className="card">
        <h3 className="rt-title">By month</h3>
        {loading ? <p className="muted">Counting…</p> : !(r.byMonth || []).length ? <p className="muted">Nothing in this period.</p> : (
          <div className="rt-wrap">
            <table className="rt">
              <thead><tr><th>Month</th><th className="num">Leads</th><th className="bar-col"> </th></tr></thead>
              <tbody>
                {r.byMonth.map((m) => (
                  <tr key={m.key}>
                    <td className="nowrap">{m.label}</td>
                    <td className="num">{m.count}</td>
                    <td className="bar-col"><div className="bar" style={{ width: `${pct(m.count, maxMonth)}%` }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="rt-title">The leads</h3>
        {loading ? <p className="muted">Loading…</p> : !(r.leads || []).length ? <p className="muted">No leads in this period.</p> : (
          <>
            <div className="rt-wrap">
              <table className="rt">
                <thead>
                  <tr><th>Date in</th><th>Date sent</th><th>Company</th><th>Salesman</th><th>Brands</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {r.leads.map((d) => (
                    <tr key={d.id}>
                      <td className="nowrap">{dubaiDay(d.created_at)}</td>
                      <td className="nowrap">{dubaiDay(d.pushed_at)}</td>
                      <td>{d.crm_lead_id
                        ? <a className="link" href={CRM_LEAD_URL + d.crm_lead_id} target="_blank" rel="noreferrer">{d.company}</a>
                        : d.company}</td>
                      <td>{d.salesman_name || '—'}</td>
                      <td>{(d.products || []).join(', ') || '—'}</td>
                      <td><span className={`pill ${d.source}`}>{d.source}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.total > r.shown && <p className="muted small">Showing the newest {r.shown} of {r.total}. Export CSV for the whole list.</p>}
          </>
        )}
      </div>
    </section>
  );
}

// One of the two count tables. Clicking a row filters the whole report by that value.
function CountTable({ title, head, note, rows, loading, active, onPick }) {
  const list = rows || [];
  return (
    <div className="card">
      <h3 className="rt-title">{title}</h3>
      {note && <p className="muted small">{note}</p>}
      {loading ? <p className="muted">Counting…</p> : !list.length ? <p className="muted">Nothing in this period.</p> : (
        <div className="rt-wrap">
          <table className="rt">
            <thead><tr><th>{head}</th><th className="num">Leads</th><th className="num">Share</th></tr></thead>
            <tbody>
              {list.map((row) => {
                const pickable = !row.name.startsWith('No '); // "No salesman" cannot be a filter
                const on = active === row.name;
                return (
                  <tr key={row.name} className={`${pickable ? 'click' : ''} ${on ? 'on' : ''}`}
                    onClick={pickable ? () => onPick(row.name) : undefined}
                    title={pickable ? (on ? 'Click to remove this filter' : `Show only ${row.name}`) : ''}>
                    <td>{row.name}</td>
                    <td className="num">{row.count}</td>
                    <td className="num">{row.share}%<div className="bar" style={{ width: `${pct(row.share, 100)}%` }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
