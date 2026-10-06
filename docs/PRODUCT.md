# Product: what Lead Staging does and why

## The problem

Lapiz Blue (UAE construction chemicals distributor) gets sales leads from several places: emails to Tarun, walk-in customers at the counter, WhatsApp messages from customers, and tips from Mayur (who runs the paints/Dulux division; his paint clients also need construction chemicals). Before this app, leads were typed into Zoho CRM by hand, got lost, or were duplicated.

Lead Staging is one web page where every lead lands as a **draft**. Tarun or Hamdan checks it, fixes anything wrong, picks the salesman, and presses **Push to CRM**. Nothing reaches Zoho CRM without a person looking at it first.

## People

| Who | Role in the app |
|---|---|
| Tarun | Reviews leads every day. Owns the Zoho Mail "Leads" folder the app reads. |
| Hamdan | Builds and maintains the app. Also reviews leads. |
| Adil | Zoho CRM admin. Connected the CRM Self Client. May look at the app occasionally. |
| Mayur | Salesman, paints division. Sends construction-chemicals leads over WhatsApp with the `/lead` tag. Tracked as his own source. |
| Counter staff | Use `/counter` with a PIN to log walk-in customers. They cannot see any leads. |
| Salesmen (CRM users) | Receive the lead in Zoho CRM as its Owner. They never use this app. |

Only Tarun and Hamdan log into the main app. One shared 6-digit code (`APP_PIN`).

## Lead sources

| Source | How it arrives | Status |
|---|---|---|
| **Email** | **Fetch leads** reads the newest 30 emails in Tarun's Zoho Mail "Leads" folder. Body becomes the raw text, attachments are copied in, a TRN is read out of PDFs (trade licence / VAT certificate). | Live |
| **Counter** | Staff fill the form at `/counter` after entering `COUNTER_PIN`. Company, category and "potential" are required; phone must be a UAE number; TRN must be 15 digits. | Live |
| **Mayur** | WhatsApp message to the company number from one of Mayur's numbers (Settings → Mayur's numbers) that contains `/lead` (also `#lead`). Anything else he sends in the next 10 minutes is appended to that lead. His normal chat is never stored. | Going live Oct 2026 via Meta coexistence (Dualhook trial) |
| **WhatsApp** | Message to the company number from anyone else. Becomes a draft only if it contains a keyword from Settings (need, bags, mapei…). Otherwise it goes to **Filtered out**, where it can be moved to Drafts by hand. Replies the staff send from the phone are ignored. | Going live Oct 2026 via Meta coexistence (Dualhook trial) |

The company WhatsApp number stays on the staff phone (WhatsApp Business app) and keeps working as before; Meta simply also sends a copy of every incoming message to the app. Expect ordinary customer chatter to pile up in **Filtered out**; that is by design, and an "ignore these numbers" setting is a possible follow-up if it gets noisy.

The source can be changed on a draft (e.g. an email that was really from Mayur).

## What happens to a draft

1. **AI pre-fill (Groq, free).** Fills *only empty fields*: company, contact, phone, email, quantity, category, products, notes, salesman named in the message. Category and products are kept only if they exactly match the CRM picklists. The person still reviews every field.
2. **Salesman assignment**, in this order:
   1. Email already forwarded by Tarun to a salesman (matched by subject in his Sent folder) → that salesman. Re-forwarding to someone else moves it.
   2. A salesman named in the message text.
   3. Round robin over the salesmen ticked in Settings.
   4. Nobody → shown in red, must be picked by hand.
3. **Duplicate warning.** Same phone (last 9 digits) or same company name (ignoring LLC, Trading, etc.) as any draft or pushed lead from the last 7 days → yellow warning. It does not block pushing.
4. **Documents.** Email attachments are copied automatically (skipping tiny inline images). Files can be dropped onto any draft, even after it is pushed; they then go straight to the CRM lead.

## Ready to push

A draft can be pushed when it has **Company, Salesman, Customer Category, at least one Product**, and (if given) a TRN of exactly 15 digits. Missing fields are red and the checkbox is disabled.

Push creates a Zoho CRM Lead with: Company, Last Name (contact or company), Lead Source (the source above), Lead Status "New Lead", Owner (salesman), Approx Quantity, TRN, Customer Category, Products, Mobile, Email, Description (notes + original message). Then it attaches the documents. A failed attachment never undoes the lead; the warning is shown on the card.

## Tabs

- **Drafts**: waiting for review. Select all ready → push together.
- **Filtered out**: WhatsApp messages without a keyword, or anything parked there by hand. "Move to Drafts" if one was real.
- **Sent to CRM**: everything pushed, with "Open in CRM". Can be recalled (see below) or removed from the list (the CRM lead is untouched).

## Moving leads between tabs

A lead can be moved one at a time (buttons on the card) or several at once (tick, then the bar above the list):

| From → To | Button | What happens |
|---|---|---|
| Drafts → Filtered out | Move to Filtered out | Parks it. Nothing else changes. |
| Filtered out → Drafts | Move to Drafts | Back for review. |
| Sent to CRM → Drafts | Recall to Drafts | **Recall.** The lead is deleted in Zoho CRM (Zoho keeps it in its Recycle Bin for 60 days), its documents are marked "not in CRM" so the next push re-attaches them, and the card returns to Drafts with all its fields so it can be fixed and pushed again as a fresh CRM lead. |
| Sent to CRM → Filtered out | Recall to Filtered out | Same recall, parked instead. |

Recall limits, shown in the confirm dialog:
- Emails Zoho already sent to the salesman when the lead was created cannot be undone.
- Notes the salesman typed on the CRM lead go to the Recycle Bin with it.
- If the salesman already **converted** the lead to a Deal, Zoho refuses to delete it. The app shows the error and leaves the lead in Sent to CRM. Undo the conversion in Zoho first.
- If the lead was already deleted in Zoho by hand, the recall still goes through.

Pushing is never a "move": it always goes through Push to CRM, which checks the required fields.

## Settings (inside the app)

- Zoho CRM connection (Self Client made while logged in as Adil).
- Zoho Mail connection (Self Client made while logged in as Tarun).
- Round-robin salesmen.
- WhatsApp keywords.
- Mayur's WhatsApp numbers.

## Business rules worth remembering

- Products `Elevator, Forbo, Innobit, Tiles, Mosaics` exist in the CRM for old leads but are hidden in the app (`HIDDEN_PRODUCTS` in `lib/zoho.js`).
- UAE phone numbers are stored as `+9715XXXXXXXX` / `+9714XXXXXXX`.
- One shared login means "pushed by" always reads "Lead app". Per-person logins are a possible future change, not a current need.
- Nothing fetches automatically; someone presses **Fetch leads**. (A scheduled fetch is a candidate improvement.)

## Not in scope / dropped

- `MAYUR_PIN` and a separate Mayur form: old idea, dropped. Mayur uses WhatsApp.
- Supabase Auth email/password logins and the `/reset` page: replaced by the shared PIN in October 2026 and removed.
