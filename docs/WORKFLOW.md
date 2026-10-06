# Workflow: how we build, test, ship and run this app

## 1. Daily use (Tarun / Hamdan)

1. Open https://lapiz-lead-staging.vercel.app, enter the 6-digit code.
2. Press **Fetch leads**. Read the green/red notice: how many new emails, how many AI pre-filled, any problems.
3. On each draft: fix red fields, check the yellow duplicate warning, pick/confirm the salesman, tick products, add documents if needed.
4. **Push to CRM** per lead, or tick several ready ones and push together.
5. **Filtered out** tab: skim WhatsApp messages that had no keyword; **Move to Drafts** if one was real.
6. **Sent to CRM** tab: "Open in CRM" to verify; remove from the list when done.

If something says "Zoho CRM is not connected" or a token error appears, see §6.

## 2. Local development

```
git clone https://github.com/hamdanxo/Lapiz-lead-staging.git
cd Lapiz-lead-staging
npm install
```

Create `.env.local` (git-ignored) with the same keys as Vercel (see `docs/ARCHITECTURE.md` → Environment variables). Copy the values from Vercel → Project → Settings → Environment Variables. Then:

```
npm run dev      # http://localhost:3000
npm test         # unit tests, run before every commit
```

Local dev talks to the **live** Supabase and Zoho. Be careful: pressing Push locally creates real CRM leads. Prefer testing push with an obviously fake company name and delete it in Zoho afterwards, or test the UI without pushing.

## 3. Making a change (Claude + Hamdan)

1. Read `CLAUDE.md`, then the doc that covers the area (`PRODUCT.md` for rules, `ARCHITECTURE.md` for where things live).
2. Edit with the editor tools so every change is visible in VS Code.
3. Keep business rules in `lib/`, keep routes thin, put testable logic in `lib/text.js` with a test in `tests/`.
4. `npm test` must pass. If a DB change is needed, add idempotent SQL to `supabase/schema.sql` and note "run schema.sql" in the commit message.
5. Update `docs/*.md` in the same commit if behaviour changed.
6. Commit locally with a message that says what and why:
   ```
   git add -A
   git commit -m "Short imperative summary

   Why it was needed, in one or two plain sentences."
   ```
7. **Show Hamdan the commit (files + summary) and wait for approval.**
8. `git push origin main`. Vercel deploys automatically in ~2 minutes.
9. Open the live URL and check the thing you changed.

Never: drag-and-drop files onto GitHub, commit `.env*`, commit PINs/keys, push without approval, force-push.

## 4. Branches

Everything goes to `main` for now (two people, one app). If a change is big or risky (e.g. WhatsApp go-live), work on a branch `feature/<name>`, push it, and Vercel gives a preview URL to test before merging:

```
git checkout -b feature/whatsapp
# …commits…
git push -u origin feature/whatsapp     # after approval
# test on the preview URL, then merge into main
```

## 5. Database changes

- All schema lives in `supabase/schema.sql` and is safe to run again (`if not exists`, `on conflict do nothing`, `add column if not exists`).
- To apply: Supabase → SQL Editor → New query → paste the whole file → Run. Expect "Success. No rows returned".
- Run it **before** pushing code that depends on the new column/table, so the live app never sees a missing column.
- Don't edit rows by hand in Supabase unless fixing a one-off problem; note what you did in the commit or chat.

## 6. Zoho: connect or reconnect

Two Self Clients, because two different people own the data:
- **CRM**: created at api-console.zoho.com while logged in as **Adil** (CRM admin). Scopes: `ZohoCRM.modules.leads.ALL,ZohoCRM.modules.attachments.CREATE,ZohoCRM.users.READ,ZohoCRM.settings.fields.READ,ZohoCRM.settings.layouts.READ`
- **Mail**: created while logged in as **Tarun**. Scopes: `ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.READ`

Steps (first time or when adding a scope):
1. App → Settings → the CRM or Mail box → Connect / Reconnect.
2. In another tab, api-console.zoho.com as the right person → Self Client → **Generate Code** → paste the scopes from the app → duration 10 minutes → Create → Copy.
3. Back in the app: paste Client ID + Client Secret (first time only) and the code → Connect. Must be done within 10 minutes.

Refresh tokens don't expire on their own. A reconnect is needed if the token was revoked, the scopes changed, or the error says "token refresh failed".

## 6b. WhatsApp: connect or reconnect (Dualhook coexistence)

The company number stays on the staff phone's WhatsApp Business app. Dualhook (dualhook.com, $12/month, 14-day trial) switches on Meta's "coexistence" and registers our URL so Meta posts incoming messages straight to the app.

Prerequisites: staff phone on the latest WhatsApp Business, number used in the app for 7+ days, Hamdan is admin of the Meta Business Portfolio, two secrets generated and stored in a password manager (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_KEY`, 32+ random characters each).

1. Vercel → Environment Variables (Production): add `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_WEBHOOK_KEY`. **Redeploy.**
2. Dualhook → new connection. Before the Meta popup, enter:
   - Webhook URL: `https://lapiz-lead-staging.vercel.app/api/whatsapp?key=<WHATSAPP_WEBHOOK_KEY>`
   - Verify token: `<WHATSAPP_VERIFY_TOKEN>`
   Meta's handshake (GET) should pass straight away.
3. Meta Embedded Signup: log in as the portfolio admin, pick Lapiz Blue's Business Portfolio, choose the number already on the WhatsApp Business app, approve on the staff phone. **Decline chat-history sharing.**
4. Dualhook shows the connection active and webhook deliveries green. Send a test message (see §9 step 8).
5. Ask Dualhook support whether a signing secret for `x-hub-signature-256` is available. If yes, add it as `WHATSAPP_APP_SECRET` in Vercel and redeploy.

Keep-alive: Meta drops coexistence if the WhatsApp Business app on the phone isn't opened for ~14 days. Dualhook reminds at day 13. If it drops, reconnect from step 2.

Disconnect / rollback: Dualhook → disconnect, or on the phone WhatsApp Business → Settings → Business tools → Business Platform. The phone keeps working; the app simply receives nothing. Removing `WHATSAPP_WEBHOOK_KEY` from Vercel makes the route reject everything.

## 7. Deploy and environment

- Vercel project is linked to the GitHub repo; every push to `main` deploys. Preview deploys for other branches.
- Env vars: Vercel → Project → Settings → Environment Variables. After changing one, **redeploy** (Deployments → ⋯ → Redeploy) because env vars are baked in at build time.
- Changing `APP_PIN` logs everyone out immediately (the cookie signature depends on it).
- Logs: Vercel → Project → Logs (filter by `/api/fetch` etc.) when something fails without a clear message.

## 8. When something breaks: checklist

| Symptom | Check |
|---|---|
| "Login code is not set up yet" | `APP_PIN` missing in Vercel env, or not redeployed after adding it |
| "Too many wrong codes" | 15-minute lock per IP; wait, or delete the `login_fail:<ip>` row in `settings` |
| "Zoho CRM is not connected yet" | Settings → Connect CRM (as Adil) |
| "Zoho mail token refresh failed" | Reconnect Mail (as Tarun) with a new code |
| "No folder called Leads" | The folder in Tarun's Zoho Mail must be named exactly `Leads` |
| Fetch says `0 new emails` but there are new ones | They may already be in Filtered/Deleted (same `external_id`), or older than the newest 30 |
| "AI pre-fill skipped: Groq 429" | Free-tier rate limit; the draft stays unparsed and retries next Fetch |
| Push: "Fill in: Products" | Product chips empty because CRM picklists failed to load; press Fetch (refreshes cache) |
| Push: CRM rejected the lead (field name in brackets) | That field's value isn't a valid picklist option in the Leads layout; fix in CRM or in the draft |
| Documents "not added" | File > 20 MB, or Storage bucket `lead-docs` missing (run `schema.sql`) |
| Counter form: "Pick a category from the list" | CRM categories changed; the form reloads them on next PIN entry |
| WhatsApp messages not arriving | Dualhook → delivery monitor (are posts leaving Meta?); Vercel → Logs filter `/api/whatsapp` (401 = `?key` in the registered URL doesn't match `WHATSAPP_WEBHOOK_KEY`, or `WHATSAPP_APP_SECRET` is set to the wrong secret); phone not opened for 14 days = coexistence dropped, reconnect |
| WhatsApp: a staff reply or old chat became a lead | Should be impossible (`field !== 'messages'` skipped); report with the Vercel log line |

## 9. Testing before a release

Minimum manual pass on the preview or live URL:
1. Login with the code; wrong code shows tries left.
2. Fetch leads; notice appears; no "Problems".
3. Edit a field on a draft, reload the page, the edit stuck.
4. Drop a small PDF on a draft, it appears with a link; remove it.
5. Push one obviously fake test lead, "Open in CRM" works, then delete it in Zoho CRM and remove from the Sent list.
6. `/counter` with the PIN: save a lead, it appears in Drafts with source Counter.
7. WhatsApp (once connected): Mayur sends `/lead TEST …` → Mayur draft; a message with a keyword from another phone → WhatsApp draft; `hello` → Filtered out; a staff reply from the phone → nothing. Delete the test drafts.

## 10. Roadmap (as of October 2026)

1. **WhatsApp go-live** — Dualhook coexistence trial (see §6b). Decide by day 12 of the trial whether to keep paying $12/month; fallback is a free second SIM on Meta's Cloud API for Mayur only.
2. Lockout on the counter PIN (same pattern as login).
3. Scheduled fetch (Vercel Cron) so email leads arrive without pressing the button.
4. Rewrite `SETUP.md` fully once WhatsApp is live.
