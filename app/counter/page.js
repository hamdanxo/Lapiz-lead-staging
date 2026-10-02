'use client';
import { useState } from 'react';

const EMPTY = { company: '', contact_name: '', phone: '', approx_qty: '', need: '', salesman_id: '', staff: '' };

export default function Counter() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [users, setUsers] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function unlock(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/counter?pin=${encodeURIComponent(pin)}`);
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ bad: true, text: j.error || 'Wrong PIN' });
    setUsers(j.users || []);
    setUnlocked(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch('/api/counter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, pin }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ bad: true, text: j.error || 'Could not save' });
    setMsg({ bad: false, text: `Saved. ${f.company} is now waiting for review.` });
    setF({ ...EMPTY, staff: f.staff });
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!unlocked) {
    return (
      <main className="center">
        <form className="panel narrow" onSubmit={unlock}>
          <div className="brand"><span className="dot" />Counter Lead</div>
          <p className="muted">Enter the counter PIN to log a walk-in customer.</p>
          <label>PIN<input inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus required /></label>
          {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
          <button className="btn primary wide" disabled={busy}>{busy ? 'Checking…' : 'Open form'}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <div className="brand"><span className="dot" />Counter Lead</div>
        <label>Company / site name *<input value={f.company} onChange={set('company')} required autoFocus /></label>
        <label>Contact person<input value={f.contact_name} onChange={set('contact_name')} /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} placeholder="05x xxx xxxx" /></label>
        <label>Approx quantity<input value={f.approx_qty} onChange={set('approx_qty')} placeholder="e.g. 40 bags, 200 sqm" /></label>
        <label>What do they need?<textarea rows={3} value={f.need} onChange={set('need')} placeholder="Products, brand, project details" /></label>
        <label>Salesman (if known)
          <select value={f.salesman_id} onChange={set('salesman_id')}>
            <option value="">Let the office decide</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label>Your name<input value={f.staff} onChange={set('staff')} placeholder="Who is entering this" /></label>
        {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</button>
      </form>
    </main>
  );
}
