'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const CRM_LEAD_URL = 'https://crm.zoho.com/crm/org719219149/tab/Leads/';
const TABS = [
  { key: 'draft', label: 'Drafts' },
  { key: 'filtered', label: 'Filtered out' },
  { key: 'pushed', label: 'Sent to CRM' },
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

  const load = useCallback(async (t = tab) => {
    const j = await api(`/api/drafts?status=${t}`);
    setDrafts(j.drafts || []);
    setCounts(j.counts || {});
  }, [tab]);

  const loadMeta = useCallback(async () => {
    try { setMeta(await api('/api/meta')); } catch (e) { setNotice({ bad: true, text: e.message }); }
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
    try {
      await api('/api/drafts', { method: 'PATCH', body: JSON.stringify({ id, action }) });
      await load();
    } catch (e) { setNotice({ bad: true, text: e.message }); }
  }

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

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    window.location.href = '/login';
  }

  const ready = drafts.filter((d) => !missing(d).length);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page">
      <header className="top">
        <div className="brand"><span className="dot" />Lead Staging</div>
        <div className="top-actions">
          <button className="btn primary" onClick={fetchLeads} disabled={!!busy}>{busy === 'fetch' ? 'Fetching…' : 'Fetch leads'}</button>
          <button className="btn" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {(!meta.connected.crm || !meta.connected.mail) && (
        <div className="alert warn">
          {!meta.connected.crm && 'Zoho CRM is not connected yet. '}
          {!meta.connected.mail && 'Zoho Mail is not connected yet. '}
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

      <section className="list">
        {drafts.length === 0 && <div className="empty">{tab === 'draft' ? 'No drafts waiting. Press Fetch leads to check for new ones.' : 'Nothing here.'}</div>}
        {drafts.map((d) =>
          tab === 'draft' ? (
            <DraftCard key={d.id} d={d} meta={meta} salesmen={salesmen}
              selected={selected.has(d.id)} onToggle={() => toggle(d.id)}
              onLocal={(f) => patchLocal(d.id, f)} onSave={(f) => save(d.id, f)}
              onDelete={() => confirm('Delete this draft? It will not go to CRM.') && setStatus(d.id, 'delete')}
              onPush={() => push([d.id])} busy={!!busy} />
          ) : tab === 'filtered' ? (
            <div className="card" key={d.id}>
              <div className="card-head"><span className={`pill ${d.source}`}>{d.source}</span><span className="muted">{d.sender ? `+${d.sender}` : ''} · {when(d.created_at)}</span></div>
              <pre className="raw">{d.raw_text}</pre>
              <div className="row-end"><button className="btn" onClick={() => setStatus(d.id, 'restore')}>Move to Drafts</button></div>
            </div>
          ) : (
            <div className="card sent" key={d.id}>
              <div className="card-head">
                <span className={`pill ${d.source}`}>{d.source}</span>
                <strong>{d.company}</strong>
                <span className="muted">→ {d.salesman_name || 'salesman'} · {when(d.pushed_at)} by {d.pushed_by}</span>
                {d.crm_lead_id && <a className="link" href={CRM_LEAD_URL + d.crm_lead_id} target="_blank" rel="noreferrer">Open in CRM</a>}
              </div>
            </div>
          )
        )}
      </section>

      {showSettings && <Settings meta={meta} salesmen={salesmen} onClose={() => { setShowSettings(false); loadMeta(); }} />}
    </div>
  );
}

function DraftCard({ d, meta, salesmen, selected, onToggle, onLocal, onSave, onDelete, onPush, busy }) {
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

      {d.raw_text && (
        <div>
          <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} original message</button>
          {open && <pre className="raw">{d.raw_text}</pre>}
        </div>
      )}

      <div className="row-end">
        <button className="btn ghost danger" onClick={onDelete}>Delete</button>
        <button className="btn primary" disabled={gaps.length > 0 || busy} onClick={onPush}>
          {gaps.length ? `Fill ${gaps.length} field${gaps.length > 1 ? 's' : ''}` : 'Push to CRM'}
        </button>
      </div>
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
          scopes="ZohoCRM.modules.leads.ALL,ZohoCRM.users.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.layouts.READ" />
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
          <label>Client ID<input value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required /></label>
          <label>Client Secret<input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} required /></label>
          <label>Generated code<input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></label>
          {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
        </form>
      )}
    </div>
  );
}
