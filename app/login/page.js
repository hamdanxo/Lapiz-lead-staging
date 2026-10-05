'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  // Emails a link to /reset where a new password can be set.
  async function forgot() {
    setErr(''); setSent('');
    if (!email.trim()) { setErr('Type your email first, then press Forgot password.'); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(`If ${email.trim()} has an account, a reset link is on its way. Open it on this same computer and browser.`);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setErr(error.message); setBusy(false); return; }
    window.location.href = '/';
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={submit}>
        <div className="brand"><img src="/lapiz-logo-white.svg" alt="Lapiz Blue" className="logo" /><span className="sep" />Lead Staging</div>
        <p className="muted">Sign in to review leads before they go to Zoho CRM.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {err && <div className="alert bad">{err}</div>}
        {sent && <div className="alert good">{sent}</div>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        <button type="button" className="link small" onClick={forgot} disabled={busy}>Forgot password?</button>
      </form>
    </main>
  );
}
