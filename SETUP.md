# Lead Staging: setup guide

What this is: one web page where leads from Mayur, Counter, WhatsApp and Email wait as drafts.
You check and fix them, pick the salesman, then press Push to CRM. No Claude credits are used.

---

## Step 1. Supabase: create the tables (2 min)

1. Open your `lead-staging` project on supabase.com
2. Left sidebar: **SQL Editor** > **New query**
3. Open the file `supabase/schema.sql` from this folder, copy everything, paste it in
4. Click **Run**. You should see "Success. No rows returned"

## Step 2. Supabase: create the two logins (2 min)

1. Left sidebar: **Authentication** > **Users** > **Add user** > **Create new user**
2. Email: `tarun.s@lapizblue.com`, set a password, tick **Auto Confirm User**, click **Create user**
3. Repeat for Hamdan's email
4. Left sidebar: **Project Settings** (gear) > **API Keys** (or **API**)
5. Keep this page open, you need two values in Step 4:
   - **anon / publishable** key
   - **service_role / secret** key (click Reveal). Never share this one.

## Step 3. GitHub: put the code online (3 min)

1. Unzip `lead-staging.zip` on your computer
2. On github.com click **+** (top right) > **New repository**
3. Name: `lapiz-lead-staging`, choose **Private**, click **Create repository**
4. On the empty repo page click **uploading an existing file**
5. Open the unzipped folder, select **everything inside it** (not the folder itself), drag it onto the page
6. Click **Commit changes**

## Step 4. Vercel: go live (3 min, logged in as Tarun)

1. vercel.com > **Add New** > **Project**
2. Connect GitHub if asked, then pick `lapiz-lead-staging` > **Import**
3. Open **Environment Variables** and add each line below (Key on the left, Value on the right):

| Key | Value |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://lxnbxihkigjtbgrzfmks.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | the anon / publishable key from Step 2 |
| SUPABASE_SERVICE_ROLE_KEY | the service_role / secret key from Step 2 |
| ALLOWED_EMAILS | tarun.s@lapizblue.com,HAMDAN_EMAIL_HERE |
| GROQ_API_KEY | your gsk_ key |
| GROQ_MODEL | llama-3.3-70b-versatile |
| COUNTER_PIN | pick a 6 digit PIN for counter staff |
| ZOHO_ACCOUNTS_URL | https://accounts.zoho.com |
| ZOHO_API_URL | https://www.zohoapis.com |
| ZOHO_MAIL_URL | https://mail.zoho.com |
| ZOHO_LEAD_LAYOUT_ID | 4591049000000091055 |

4. Click **Deploy**. Wait about 2 minutes. You get a link like `lapiz-lead-staging.vercel.app`

## Step 5. Connect Zoho inside the app (5 min)

Zoho needs **two** Self Clients, because two different people own the data:

- **CRM** must be connected from a CRM admin login (Adil). Tarun is not a CRM user.
- **Mail** must be connected from Tarun's login, because it reads Tarun's Leads folder.

For each one:
1. Open the app, sign in, click **Settings**
2. In a new tab open **api-console.zoho.com** logged in as the right person (Adil for CRM, Tarun for Mail)
3. Open the **Self Client** (create one if that person has none) > **Generate Code** tab
4. Copy the scopes shown in the app's Settings box, paste into **Scope**
5. Time: **10 minutes**, description: `lead staging`, click **Create**, then **Copy** the code
6. Back in the app: paste **Client ID**, **Client Secret** (from the Client Secret tab) and the **code**, click **Connect**

Do it straight away, the code dies after 10 minutes.

## Step 6. Last settings (1 min)

In **Settings**: tick the salesmen for round robin, check the keyword list, click **Save settings**.

## Daily use

- **Fetch leads**: pulls new emails from the Leads folder and lets the free AI fill in blanks
- Fix anything in red, change the salesman if needed
- **Push to CRM** on one lead, or tick several and push together
- **Filtered out** tab: WhatsApp chats that didn't look like leads. **Move to Drafts** if one was real
- **Sent to CRM** tab: everything pushed, with an Open in CRM link

Counter staff use: `your-link.vercel.app/counter` with the PIN. They can only add leads, not see them.

## WhatsApp (later, after Meta approval)

Webhook URL to give Meta: `your-link.vercel.app/api/whatsapp`
Add two more Vercel variables then: `WHATSAPP_VERIFY_TOKEN` (any word you choose, same one typed in Meta) and `WHATSAPP_APP_SECRET` (from the Meta app settings).
