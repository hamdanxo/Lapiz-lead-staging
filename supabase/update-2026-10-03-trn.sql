-- Run once in Supabase > SQL Editor before uploading the new code
alter table drafts add column if not exists trn text;
