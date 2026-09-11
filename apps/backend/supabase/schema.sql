-- MediBridge cases table. Run once in Supabase → SQL Editor.
-- Only the backend (secret / service_role key) reads and writes. The public
-- anon/authenticated roles get no grants, and RLS with no policies blocks them too.

create table if not exists public.cases (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'new' check (status in ('new', 'reviewed', 'follow_up')),
  triage_level  text not null check (triage_level in ('RED', 'YELLOW', 'GREEN')),
  language      text not null default 'en',
  patient       jsonb not null default '{}'::jsonb,  -- name, age, sex, phone, pregnant
  messages      jsonb not null default '[]'::jsonb,  -- intake conversation
  documents     jsonb not null default '[]'::jsonb,  -- uploaded document metadata
  vitals        jsonb,
  extraction    jsonb not null default '{}'::jsonb,  -- AI/rules extracted facts + flags
  summary       text,                                -- AI clinical summary (doctor reviews)
  triage        jsonb not null default '{}'::jsonb   -- Safety Engine result: level, reasons, engine_version
);

create index if not exists cases_created_at_idx on public.cases (created_at desc);
create index if not exists cases_triage_status_idx on public.cases (triage_level, status);

alter table public.cases enable row level security;

revoke all on public.cases from anon, authenticated;
grant select, insert, update, delete on public.cases to service_role;
