-- Run this once in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run)

create table if not exists kv_store (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;

-- Personal single-user app: allow the anon key (used by the deployed site)
-- to read and write freely. This matches the same trust model as
-- Sheldon Actions — fine for a private tool, not for anything you'd want
-- to keep secret from anyone who found the URL.
create policy "Allow anon read" on kv_store
  for select using (true);

create policy "Allow anon write" on kv_store
  for insert with check (true);

create policy "Allow anon update" on kv_store
  for update using (true);
