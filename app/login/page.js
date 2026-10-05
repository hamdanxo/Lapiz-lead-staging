'use client';
import { useState } from 'react';

export default function Login() {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || 'Wrong code'); setBusy(false); setPin(''); return; }
    window.location.href = '/';
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <div className="brand"><img src="/lapiz-logo-white.svg" alt="Lapiz Blue" className="logo" /><span className="sep" />Lead Staging</div>
        <p className="muted">Enter the 6 digit code to open the lead app.</p>
        <label>Code
          <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus
            style={{ letterSpacing: '8px', fontSize: 20, textAlign: 'center' }} />
        </label>
        {err && <div className="alert bad">{err}</div>}
        <button className="btn primary wide" disabled={busy || pin.length !== 6}>{busy ? 'Checking…' : 'Open'}</button>
      </form>
    </main>
  );
}
