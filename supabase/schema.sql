-- Lead Staging: run this once in Supabase > SQL Editor > New query > Run

create extension if not exists pgcrypto;

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('Mayur','Counter','WhatsApp','Email')),
  status text not null default 'draft' check (status in ('draft','filtered','pushed','deleted')),
  external_id text unique,            -- WhatsApp message id / email message id, stops duplicates
  raw_text text,
  sender text,                        -- phone number or email address it came from
  company text,
  contact_name text,
  phone text,
  email text,
  approx_qty text,
  customer_category text,
  products text[] default '{}',
  salesman_id text,
  salesman_name text,
  notes text,
  parsed boolean not null default false,
  dup_warning text,
  crm_lead_id text,
  push_error text,
  created_by text,
  pushed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pushed_at timestamptz
);

create index if not exists drafts_status_idx on drafts (status, created_at desc);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) can touch these tables.
alter table drafts enable row level security;
alter table settings enable row level security;

insert into settings (key, value) values
  ('mayur_numbers', '["971564221423"]'),
  ('keywords', '["need","require","required","want","chahiye","quote","quotation","price","rate","available","stock","delivery","enquiry","inquiry","qty","quantity","bags","bag","kg","ltr","litre","liter","sqm","m2","drum","pail","pcs","carton","box","adhesive","grout","waterproofing","epoxy","primer","sealant","membrane","screed","paint","tools","mapei","kerakoll","weber","dulux","dewalt"]'),
  ('rotation', '{"ids":[],"next":0}')
on conflict (key) do nothing;
