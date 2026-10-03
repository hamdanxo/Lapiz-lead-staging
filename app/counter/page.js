'use client';
import { useState } from 'react';
import { normalizeUaePhone, validTrn } from '@/lib/text';

const EMPTY = { company: '', contact_name: '', phone: '', customer_category: '', potential: '', trn: '', salesman_id: '', staff: '' };

// Keep only what each field is allowed to hold, as the person types.
const onlyPhoneChars = (v) => v.replace(/[^\d+\s]/g, '').slice(0, 18);
const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 15);
const noDigits = (v) => v.replace(/\d/g, '');

function fieldErrors(f) {
  const e = {};
  if (!f.company.trim()) e.company = 'Company name is needed';
  if (!f.customer_category) e.customer_category = 'Pick a category';
  if (f.potential.trim().length < 3) e.potential = 'Write what this customer could buy';
  if (f.phone.trim() && !normalizeUaePhone(f.phone)) e.phone = 'Enter a UAE number, e.g. 050 123 4567';
  if (f.trn.trim() && !validTrn(f.trn)) e.trn = 'TRN is 15 digits';
  return e;
}

export default function Counter() {
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const errors = fieldErrors(f);

  async function unlock(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/counter?pin=${encodeURIComponent(pin)}`);
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ bad: true, text: j.error || 'Wrong PIN' });
    setUsers(j.users || []);
    setCategories(j.categories || []);
    setUnlocked(true);
  }

  async function submit(e) {
    e.preventDefault();
    setTouched({ company: 1, customer_category: 1, potential: 1, phone: 1, trn: 1 });
    if (Object.keys(errors).length) return setMsg({ bad: true, text: 'Fix the fields in red first.' });
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
    setTouched({});
  }

  const set = (k, filter) => (e) => setF({ ...f, [k]: filter ? filter(e.target.value) : e.target.value });
  const blur = (k) => () => setTouched({ ...touched, [k]: 1 });
  const err = (k) => (touched[k] && errors[k] ? errors[k] : null);
  const cls = (k) => (err(k) ? 'need' : '');

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
      <form className="panel narrow" onSubmit={submit} noValidate>
        <div className="brand"><span className="dot" />Counter Lead</div>

        <label className={cls('company')}>Company / site name *
          <input value={f.company} onChange={set('company')} onBlur={blur('company')} autoFocus />
          {err('company') && <span className="field-err">{err('company')}</span>}
        </label>

        <label>Contact person
          <input value={f.contact_name} onChange={set('contact_name', noDigits)} autoComplete="off" />
        </label>

        <label className={cls('phone')}>Phone
          <input type="tel" inputMode="tel" value={f.phone} onChange={set('phone', onlyPhoneChars)} onBlur={blur('phone')} placeholder="050 123 4567" />
          {err('phone') && <span className="field-err">{err('phone')}</span>}
        </label>

        <label className={cls('customer_category')}>Customer category *
          <select value={f.customer_category} onChange={set('customer_category')} onBlur={blur('customer_category')}>
            <option value="">Pick a category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {err('customer_category') && <span className="field-err">{err('customer_category')}</span>}
        </label>

        <label className={cls('potential')}>Potential of the lead *
          <textarea rows={3} value={f.potential} onChange={set('potential')} onBlur={blur('potential')} placeholder="Products, brand, quantity, project size" />
          {err('potential') && <span className="field-err">{err('potential')}</span>}
        </label>

        <label className={cls('trn')}>TRN
          <input inputMode="numeric" value={f.trn} onChange={set('trn', onlyDigits)} onBlur={blur('trn')} placeholder="15 digits" />
          {err('trn') && <span className="field-err">{err('trn')}</span>}
        </label>

        <label>Salesman (if known)
          <select value={f.salesman_id} onChange={set('salesman_id')}>
            <option value="">Let the office decide</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>

        <label>Your name<input value={f.staff} onChange={set('staff', noDigits)} placeholder="Who is entering this" /></label>

        {msg && <div className={`alert ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</div>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save lead'}</button>
      </form>
    </main>
  );
}
