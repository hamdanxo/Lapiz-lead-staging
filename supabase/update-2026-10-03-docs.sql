-- Update 2026-10-03: documents attached to leads (safe to run again)
create table if not exists draft_docs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts(id) on delete cascade,
  name text not null,
  mime text,
  size integer,
  path text not null unique,
  source text not null default 'upload' check (source in ('email','upload')),
  text text,
  crm_attachment_id text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists draft_docs_draft_idx on draft_docs (draft_id);
alter table draft_docs enable row level security;

-- Private file storage for those documents (only the server can read it).
insert into storage.buckets (id, name, public, file_size_limit)
values ('lead-docs', 'lead-docs', false, 20971520)
on conflict (id) do nothing;
