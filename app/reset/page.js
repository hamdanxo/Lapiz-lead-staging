'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Opened from the "reset password" email. Swaps the code in the link for a session,
// then lets the person choose a new password.
export default function Reset() {
  const [stage, setStage] = useState('checking'); // checking | form | done | bad
  const [msg, setMsg] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const problem = q.get('error_description');
      if (problem) { setMsg(problem); setStage('bad'); return; }
      const code = q.get('code');
      const sb = supabaseBrowser();
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg('This link has expired or was opened in a different browser. Go back to the login page and press Forgot password again, then open the new email on the same computer and browser.');
          setStage('bad'); return;
        }
      }
      const { data } = await sb.auth.getSession();
      if (data && data.session) setStage('form');
      else { setMsg('This reset link is not valid any more. Ask for a new one from the login page.'); setStage('bad'); }
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    if (pw.length < 10) return setMsg('Use at least 10 characters.');
    if (pw !== pw2) return setMsg('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    setStage('done');
    setTimeout(() => { window.location.href = '/'; }, 1500);
  }

  return (
    <main className="center">
      <form className="panel narrow" onSubmit={save}>
        <div className="brand"><img src="/lapiz-logo-white.svg" alt="Lapiz Blue" className="logo" /><span className="sep" />New password</div>
        {stage === 'checking' && <p className="muted">Checking your link…</p>}
        {stage === 'bad' && (<><div className="alert bad">{msg}</div><a className="btn wide" href="/login" style={{ textAlign: 'center' }}>Back to login</a></>)}
        {stage === 'done' && <div className="alert good">Password saved. Opening the app…</div>}
        {stage === 'form' && (
          <>
            <p className="muted">Choose a new password for the lead app.</p>
            <label>New password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required autoComplete="new-password" /></label>
            <label>Type it again<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" /></label>
            {msg && <div className="alert bad">{msg}</div>}
            <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </>
        )}
      </form>
    </main>
  );
}
