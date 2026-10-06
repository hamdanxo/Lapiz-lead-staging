# Lead Staging (Lapiz Blue)

Holding area where sales leads from Email, Counter, Mayur and WhatsApp wait as drafts until a person reviews them and pushes them to Zoho CRM. Next.js 14 (App Router, plain JS), Supabase (Postgres + storage), Zoho CRM/Mail APIs, Groq for AI pre-fill. Live at https://lapiz-lead-staging.vercel.app.

Read these before changing anything:
- `docs/PRODUCT.md` — what the app does, who uses it, the business rules (lead sources, salesman assignment, what "ready to push" means).
- `docs/ARCHITECTURE.md` — stack, every file and what it owns, data model, request flows, env vars, external APIs.
- `docs/WORKFLOW.md` — how to develop, test, commit, deploy, run DB changes, reconnect Zoho, and the review checklist.

## Working with Hamdan

- Hamdan is building this as his first project, for Tarun. Explain plainly, no jargon without a one-line meaning.
- Edit files with the editor tools so changes are visible in VS Code. Never upload through the GitHub website.
- Commit locally, then **show the diff summary and ask before `git push`**. Every time.
- Never put secrets (APP_PIN, COUNTER_PIN, API keys, Zoho client secrets) in any tracked file. They live in Vercel env vars and the Supabase `settings` table.
- The app is live and used daily. Prefer small, reversible changes. If a change needs a DB migration, add it to `supabase/schema.sql` as idempotent SQL (`if not exists`, `on conflict do nothing`) and say so in the commit message.

## Commands

```
npm install        # once
npm run dev        # http://localhost:3000 (needs .env.local, see docs/WORKFLOW.md)
npm test           # 17 unit tests on lib/text.js and lib/session.js, no network
npm run build      # what Vercel runs
```

## Code conventions

- Plain JavaScript, no TypeScript. `@/` maps to the repo root.
- Server-only code in `lib/`; API routes in `app/api/*/route.js` are thin and call `lib/`. Every protected route starts with `const auth = await requireUser(); if (auth.error) return auth.error;`.
- Pure helpers (no network) go in `lib/text.js` so they can be unit-tested in `tests/`.
- Comments explain *why* in plain English, one line, like the existing ones. Match that density.
- Errors are returned as `{ error: 'plain sentence a non-developer understands' }`; the UI shows them as-is.
- Every API step that can fail independently reports its own result (see `runFetch` in `lib/drafts.js`) so one failure never hides the rest.

## When done with a task

1. `npm test` passes.
2. If behaviour changed, update the relevant `docs/*.md` in the same commit.
3. Commit with a clear message, then ask Hamdan before pushing.
