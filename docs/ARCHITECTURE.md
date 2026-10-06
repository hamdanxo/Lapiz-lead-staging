# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14, App Router, plain JavaScript, React 18 | `jsconfig.json` maps `@/*` to the repo root |
| Hosting | Vercel, region `bom1` (Mumbai) | `vercel.json`. Deploys on every push to `main`. |
| Database | Supabase Postgres | Tables `drafts`, `settings`, `draft_docs`. RLS on, so only the server (service-role key) can read/write. |
| File storage | Supabase Storage bucket `lead-docs` (private, 20 MB/file) | Browser uploads via signed URLs; downloads via 1-hour signed links |
| CRM | Zoho CRM API v8 | OAuth Self Client, refresh token stored in `settings` |
| Email | Zoho Mail API | Reads Tarun's "Leads" and "Sent" folders |
| AI | Groq, `llama-3.3-70b-versatile`, JSON mode | Free tier. Only fills blanks. |
| PDF text | `unpdf` | Used for TRN detection and AI input |
| WhatsApp | Meta Cloud API webhooks, delivered via Meta "coexistence" on the company number (partner: Dualhook, $12/mo) | Staff phone keeps the WhatsApp Business app; Meta posts straight to our URL |

## Folder map

```
app/
  layout.js            fonts (Cormorant Garamond + Nunito Sans), backdrop, grain
  globals.css          all styling; dark theme, classes: card, pill, chip, alert, drawer…
  page.js              the main app (client component): tabs, DraftCard, Docs, Settings, ConnectBox
  login/page.js        6-digit code form → POST /api/login
  counter/page.js      PIN gate + walk-in lead form (client-side validation mirrors the API)
  api/
    login/route.js     check APP_PIN, set signed cookie; 10 wrong tries per IP = 15 min lock (stored in settings)
    logout/route.js    clear cookie
    meta/route.js      salesmen + picklists (15 min cache) + which Zoho connections exist
    drafts/route.js    GET list by status (+counts +docs); PATCH edit fields / delete / move (incl. recall) / remove_sent
    fetch/route.js     POST → lib/drafts.runFetch()
    push/route.js      POST {ids} → create CRM leads + attach docs
    docs/route.js      GET links; POST upload-url / register / sync; DELETE file
    settings/route.js  GET/POST rotation, keywords, mayur_numbers
    connect/route.js   POST Zoho Self Client code → refresh token
    counter/route.js   GET ?pin → users+categories; POST → insert Counter draft
    whatsapp/route.js  GET Meta verification; POST Meta webhook → classify → insert
lib/
  auth.js      requireUser() for API routes (reads cookie), json() helper
  session.js   HMAC-signed cookie token; works in Edge middleware and Node routes
  pin.js       timing-safe PIN compare with a 1.5 s delay on failure
  db.js        Supabase service-role client; getSetting/setSetting on the settings table
  text.js      pure helpers: phone/TRN/company normalisation, keyword match, WhatsApp classify, round robin, HTML strip, forward detection, TRN finder. Unit-tested.
  zoho.js      OAuth token refresh, CRM users/picklists (cached), create lead, attach file, Mail folder/message/attachment reads
  groq.js      parseLead(): prompt + JSON parse + picklist validation
  drafts.js    insertDraft (round robin + dedupe on external_id), moveDraft (tab moves + CRM recall), fetchEmail, enrichPending (AI), flagDuplicates, salesmanNames, runFetch
  docs.js      storage paths, extractText (PDF/txt), storeDoc, registerUpload, saveEmailDocs, trnFromDocs, pushDocsToCrm, docsWithLinks
  whatsapp.js  webhookAuthorized() (signature or URL key, fail closed), messageText(). Unit-tested.
  supabase-browser.js  anon client, used only for uploadToSignedUrl
middleware.js  redirects to /login unless the cookie is valid; /login, /counter, /api/* and images are public
supabase/schema.sql    full schema, idempotent, run in Supabase SQL Editor
tests/*.test.mjs       node:test, no network
public/lapiz-logo-white.svg
docs/                  this folder
SETUP.md               first-time setup for a new environment
```

## Data model

### `drafts`
One row per lead. Key columns:
- `source` ∈ Mayur | Counter | WhatsApp | Email
- `status` ∈ draft | filtered | pushed | deleted
- `external_id` unique: `email:<messageId>`, `wa:<messageId>`, `counter:<uuid>`. Upsert with `ignoreDuplicates` makes re-fetching safe.
- `raw_text` the original message (max 20 000 chars). Email format: `Subject: …\nFrom: …\nForwarded to: <name>\n\n<body>`. The "Forwarded to" line is how the app remembers a lead was already forwarded.
- Lead fields: `company, contact_name, phone, email, approx_qty, trn, customer_category, products text[], salesman_id, salesman_name, notes`
- Bookkeeping: `parsed` (AI done), `dup_warning`, `crm_lead_id`, `push_error` (also used for non-fatal notes), `created_by`, `pushed_by`, `pushed_at`

### `settings` (key → jsonb)
| key | value |
|---|---|
| `rotation` | `{ ids: [salesmanId…], next: n }` |
| `keywords` | `["need", …]` |
| `mayur_numbers` | `["9715…"]` digits only |
| `zoho_crm`, `zoho_mail` | `{ client_id, client_secret, refresh_token, access_token, expires_at, account_id?, folder_id?, sent_folder_id? }` |
| `crm_cache` | `{ at, users, customerCategories, products }` 15-min cache |
| `login_fail:<ip>` | `{ n, at }` lockout counter |

### `draft_docs`
`draft_id → drafts.id` (cascade), `name, mime, size, path` (storage key `<draftId>/<ts>-<rand>-<safeName>`), `source` ∈ email | upload, `text` (extracted, ≤20 000 chars), `crm_attachment_id` (set once sent; `'sent'` if Zoho returned no id).

## Request flows

### Login
`/login` → `POST /api/login {pin}` → `pinOk(pin,'APP_PIN')` → cookie `lead_session = <exp>.<hmac>` for 30 days. HMAC key = `APP_PIN + SUPABASE_SERVICE_ROLE_KEY`, so changing the PIN logs everyone out. `middleware.js` checks the cookie for pages; every API route checks it via `requireUser()`.

### Fetch leads (`POST /api/fetch` → `runFetch`)
1. `crmUsers({fresh:true})`, `crmMeta()` — salesmen and picklists.
2. `fetchEmail(users)`: list 30 newest Leads-folder messages; skip ones already in `drafts`; read body (HTML → text); check Sent folder for a forward (`forwardedSalesman`); `insertDraft`; copy attachments (`saveEmailDocs`), find TRN (`trnFromDocs`). Then re-check open email drafts for forwards made after fetching.
3. `enrichPending(users, meta)`: up to 15 unparsed drafts → Groq → fill blanks only; normalise phone; salesman named in text wins unless already forwarded. On Groq error, `parsed` stays false and is retried next time.
4. `flagDuplicates()` over the last 7 days.
5. `salesmanNames(users)` fills `salesman_name` from ids.
Each step reports separately; UI shows `Fetched: N new emails, M pre-filled by AI. Problems: …`.

### Push (`POST /api/push {ids}`)
For each id: atomically `update status='pushed' where status='draft'` (claims the row; a double click can't create two leads) → validate required fields (revert to draft if missing) → `crmCreateLead` → save `crm_lead_id` → `pushDocsToCrm` (per-file errors go into `push_error` as a warning) → on CRM error revert to draft and store the message.

### Move / recall (`PATCH /api/drafts {action:'move', ids, to}`)
`to` ∈ draft | filtered. For each id `moveDraft(id, to)` (`lib/drafts.js`): `canMove(status, to)` (`lib/text.js`) allows draft↔filtered and pushed→draft/filtered only. From `pushed` it first calls `crmDeleteLead(crm_lead_id)` (`lib/zoho.js`, `DELETE /crm/v8/Leads/{id}`; "already gone" counts as success, anything else such as a converted lead aborts with Zoho's message), then nulls `draft_docs.crm_attachment_id` for the draft. The final update is `.eq('status', <old status>)` so a concurrent move becomes a no-op reported as an error. Clears `crm_lead_id, pushed_at, pushed_by, push_error`. Returns `{ results: [{ id, ok, error }] }`. `action:'restore'` is kept as an alias for move-to-draft.

### Documents
- Upload: browser asks `POST /api/docs {action:'upload-url'}` → signed upload URL → browser uploads directly to Storage → `POST {action:'register'}` → server downloads it, extracts text, inserts `draft_docs`, runs `trnFromDocs`; if the draft is already pushed, sends the file to CRM immediately.
- Listing: `GET /api/drafts` returns docs with 1-hour signed URLs in the same response as the drafts.

### WhatsApp (`/api/whatsapp`, Meta Cloud API format)
`GET` answers Meta's verification (`hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`). `POST` must pass `webhookAuthorized()` (`lib/whatsapp.js`): if `WHATSAPP_APP_SECRET` is set, `x-hub-signature-256` must match; otherwise the `?key=` in the URL must equal `WHATSAPP_WEBHOOK_KEY`; with neither set every post is rejected (401). Only `changes[].field === 'messages'` is processed; coexistence extras (`smb_message_echoes` = staff replies from the phone, `history`, `smb_app_state_sync`) are skipped. For each message: `messageText(m)` → `classifyWhatsApp(sender, text)` → Mayur+`/lead` = draft (source Mayur); Mayur without tag = append to his draft from the last 10 min, else drop; others = draft if keyword, else filtered. `external_id = wa:<message id>` makes Meta's retries harmless. Always returns 200 fast so Meta doesn't retry.

Why the URL key: Meta signs webhooks with the secret of the app that holds the subscription. Through a coexistence partner that is the partner's app, so the signature usually can't be checked by us; the registered URL (query string included) is the shared secret instead.

### Counter (`/counter`)
`GET /api/counter?pin=` returns salesmen and categories after `COUNTER_PIN` check. `POST` validates (UAE phone, 15-digit TRN, category must exist in CRM) and inserts a Counter draft with round-robin salesman if none picked.

## Zoho integration details

- Two Self Clients: **CRM** created by Adil (admin), **Mail** created by Tarun. Scopes are in `CRM_SCOPES` / `MAIL_SCOPES` in `lib/zoho.js` and shown in Settings.
- `connect(kind, …)` swaps the 10-minute grant code for a refresh token and stores it in `settings.zoho_<kind>`. Reconnecting with only a new code reuses the saved client id/secret.
- `token(kind)` refreshes the access token when it is within 60 s of expiry.
- Picklists come from the Leads layout `ZOHO_LEAD_LAYOUT_ID` (layout-specific values), falling back to module fields. Cached 15 min in memory and in `settings.crm_cache`.
- CRM endpoints used: `/crm/v8/users`, `/crm/v8/settings/layouts/{id}?module=Leads`, `/crm/v8/settings/fields?module=Leads`, `POST /crm/v8/Leads` (with `trigger:['workflow']` and `Layout`), `POST /crm/v8/Leads/{id}/Attachments` (multipart), `DELETE /crm/v8/Leads/{id}` (recall; needs `leads.ALL`, already in scope).
- Mail endpoints: `/api/accounts`, `/api/accounts/{id}/folders`, `/api/accounts/{id}/messages/view?folderId=…`, `/messages/{id}/content`, `/messages/{id}/attachmentinfo`, `/messages/{id}/attachments/{attId}`.
- "Open in CRM" link uses the hardcoded org URL in `app/page.js` (`CRM_LEAD_URL`).

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key, used only for signed-URL uploads from the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; all DB/storage access. Never in the browser. |
| `APP_PIN` | 6-digit login code for Tarun and Hamdan |
| `COUNTER_PIN` | PIN for counter staff |
| `GROQ_API_KEY`, `GROQ_MODEL` | AI pre-fill (model defaults to `llama-3.3-70b-versatile`) |
| `ZOHO_ACCOUNTS_URL`, `ZOHO_API_URL`, `ZOHO_MAIL_URL` | default to the .com data centre |
| `ZOHO_LEAD_LAYOUT_ID` | Leads layout whose picklists the app uses |
| `WHATSAPP_VERIFY_TOKEN` | Any long random string; Meta's GET handshake must present it |
| `WHATSAPP_WEBHOOK_KEY` | Long random string that must appear as `?key=` in the webhook URL registered with Meta/Dualhook |
| `WHATSAPP_APP_SECRET` | Optional. Only if a signing secret for `x-hub-signature-256` is available; then it takes precedence over the key |

Zoho client ids/secrets and refresh tokens are **not** env vars; they are stored in the `settings` table by the Connect flow.

## Security model, in short

- Everything data-related runs server-side with the service-role key; the browser never talks to the tables.
- Pages are gated by middleware; APIs by `requireUser()`. Public: `/login`, `/counter`, `/api/login`, `/api/counter`, `/api/whatsapp`, images.
- PIN compares are timing-safe with a 1.5 s delay on failure; the main login also locks per IP after 10 failures.
- WhatsApp webhook fails closed: no secret/key configured means nothing is accepted.
- Known gaps: counter PIN has no lockout; one shared login (no per-person audit).

## Limits and timeouts

- `/api/fetch`, `/api/push`, `/api/docs` set `maxDuration = 60` (Vercel function limit).
- Fetch reads 30 newest emails and 200 sent emails; AI handles 15 drafts per run.
- Files: 20 MB each (CRM limit). Text extraction capped at 20 000 chars; AI sees 3 000 chars of message + 3 000 of documents.
