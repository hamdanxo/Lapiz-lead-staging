# Lead Staging: setup guide (new environment)

What this is: one web page where leads from Mayur, Counter, WhatsApp and Email wait as drafts.
You check and fix them, pick the salesman, then press Push to CRM. The AI pre-fill uses Groq's free tier.

The app is already live at https://lapiz-lead-staging.vercel.app. Use this guide only to set it up again from scratch (new Supabase project, new Vercel project). For day-to-day work see `docs/WORKFLOW.md`.

---

## Step 1. Supabase: create the tables (2 min)

1. Open the project on supabase.com
2. Left sidebar: **SQL Editor** > **New query**
3. Open `supabase/schema.sql` from this folder, copy everything, paste it in
4. Click **Run**. You should see "Success. No rows returned". This also creates the private `lead-docs` file bucket.
5. **Project Settings** (gear) > **API Keys**. You need two values in Step 3:
   - **anon / publishable** key
   - **service_role / secret** key (click Reveal). Never share this one.

No Supabase user accounts are needed. The app has one shared login code (`APP_PIN`).

## Step 2. GitHub (already done)

The code lives at https://github.com/hamdanxo/Lapiz-lead-staging. Changes are committed from VS Code and pushed to `main`; never upload files through the GitHub website.

## Step 3. Vercel: go live (3 min)

1. vercel.com > **Add New** > **Project** > import `Lapiz-lead-staging`
2. **Environment Variables**: add each line (Key left, Value right)

| Key | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | your Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | anon / publishable key from Step 1 |
| SUPABASE_SERVICE_ROLE_KEY | service_role / secret key from Step 1 |
| APP_PIN | 6-digit login code for Tarun and Hamdan |
| COUNTER_PIN | PIN for counter staff (4+ digits) |
| GROQ_API_KEY | your `gsk_` key from console.groq.com |
| GROQ_MODEL | llama-3.3-70b-versatile |
| ZOHO_ACCOUNTS_URL | https://accounts.zoho.com |
| ZOHO_API_URL | https://www.zohoapis.com |
| ZOHO_MAIL_URL | https://mail.zoho.com |
| ZOHO_LEAD_LAYOUT_ID | 4591049000000091055 |

3. **Deploy**. Wait about 2 minutes.

Changing an env var later needs a **Redeploy** to take effect. Changing `APP_PIN` logs everyone out.

## Step 4. Connect Zoho inside the app (5 min)

Zoho needs **two** Self Clients, because two different people own the data:

- **CRM** must be connected from a CRM admin login (Adil). Tarun is not a CRM user.
- **Mail** must be connected from Tarun's login, because it reads Tarun's "Leads" folder.

For each one:
1. Open the app, sign in with the code, click **Settings**
2. In a new tab open **api-console.zoho.com** logged in as the right person (Adil for CRM, Tarun for Mail)
3. Open the **Self Client** (create one if that person has none) > **Generate Code** tab
4. Copy the scopes shown in the app's Settings box, paste into **Scope**
5. Time: **10 minutes**, description: `lead staging`, click **Create**, then **Copy** the code
6. Back in the app: paste **Client ID**, **Client Secret** (from the Client Secret tab) and the **code**, click **Connect**

Do it straight away, the code dies after 10 minutes.

## Step 5. Last settings (1 min)

In **Settings**: tick the salesmen for round robin, check the keyword list and Mayur's numbers, click **Save settings**.

## Daily use

- **Fetch leads**: pulls new emails from the Leads folder and lets the AI fill in blanks
- Fix anything in red, change the salesman if needed
- **Push to CRM** on one lead, or tick several and push together
- **Filtered out** tab: WhatsApp chats that didn't look like leads. **Move to Drafts** if one was real
- **Sent to CRM** tab: everything pushed, with an Open in CRM link

Counter staff use: `your-link.vercel.app/counter` with the PIN. They can only add leads, not see them.

## WhatsApp (not live yet)

The webhook at `/api/whatsapp` expects Meta WhatsApp Cloud API payloads. When the provider is chosen, add `WHATSAPP_VERIFY_TOKEN` (any word you choose, same one typed in Meta) and `WHATSAPP_APP_SECRET` (from the Meta app settings) to Vercel and redeploy. See `docs/WORKFLOW.md` → Roadmap.
