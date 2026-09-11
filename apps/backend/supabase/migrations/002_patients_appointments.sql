-- MediBridge migration 002: patients, doctors, appointments, documents (+ demo doctors).
-- Run once in Supabase -> SQL Editor, after schema.sql. Safe to re-run.
-- Only the backend (secret / service_role key) reads and writes; anon and
-- authenticated get no grants, and RLS with no policies blocks them too.

create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  patient_code      text not null unique,                 -- PAT-XXXXXXXX, shown on the QR code
  name              text,
  phone             text,
  age               int check (age between 0 and 130),
  sex               text check (sex in ('male', 'female', 'other')),
  pregnancy_status  text not null default 'unknown' check (pregnancy_status in ('pregnant', 'not_pregnant', 'unknown')),
  language          text not null default 'en',
  latitude          double precision,
  longitude         double precision,
  token_hash        text not null,                        -- SHA-256 of the device token; the token itself is never stored
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.doctors (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  specialization       text,
  email                text unique,
  password_hash        text,                              -- PBKDF2-SHA256 (demo login)
  latitude             double precision not null,
  longitude            double precision not null,
  availability_status  text not null default 'available' check (availability_status in ('available', 'busy', 'offline')),
  next_available_at    timestamptz,
  slot_minutes         int not null default 15 check (slot_minutes between 5 and 120),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.cases add column if not exists patient_id uuid references public.patients(id);
alter table public.cases add column if not exists fused_context jsonb;
create index if not exists cases_patient_idx on public.cases (patient_id, created_at desc);

create table if not exists public.appointments (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients(id),
  doctor_id          uuid references public.doctors(id),
  case_id            uuid references public.cases(id),
  scheduled_at       timestamptz not null,
  duration_minutes   int not null default 15,
  triage_level       text not null check (triage_level in ('RED', 'YELLOW', 'GREEN')),
  priority           int not null check (priority in (1, 2, 3)),
  status             text not null default 'scheduled'
                     check (status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  distance_km        double precision,
  assignment_reason  text,
  assignment         jsonb,                               -- rule + every doctor considered
  requested_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- One active booking per doctor per start time: stops double booking under concurrency
create unique index if not exists appointments_doctor_slot_uniq
  on public.appointments (doctor_id, scheduled_at) where status <> 'cancelled';
create index if not exists appointments_patient_idx on public.appointments (patient_id, scheduled_at desc);
create index if not exists appointments_case_idx on public.appointments (case_id);
create index if not exists appointments_active_idx on public.appointments (status, scheduled_at);

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id),
  case_id       uuid references public.cases(id),
  name          text not null,
  mime_type     text,
  size_bytes    int,
  doc_type      text,
  status        text not null check (status in ('processed', 'partial', 'empty', 'failed')),
  ocr           jsonb,                                    -- PaddleOCR result
  analysis      jsonb,                                    -- Gemini findings
  storage_path  text,                                     -- original file in the private "documents" bucket
  created_at    timestamptz not null default now()
);
create index if not exists documents_patient_idx on public.documents (patient_id, created_at desc);
create index if not exists documents_case_idx on public.documents (case_id);

do $$
declare t text;
begin
  foreach t in array array['patients', 'doctors', 'appointments', 'documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Private bucket for original uploads (served to doctors through short-lived signed URLs)
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Demo doctors (fictional). A is closest but busy; B is free in 20 min; C in 45 min.
insert into public.doctors (id, name, specialization, email, password_hash, latitude, longitude,
                            availability_status, next_available_at, slot_minutes)
values
  ('d0c70000-0000-4000-8000-00000000000a', 'Dr. Arjun Mehta', 'General Medicine', 'arjun.mehta@medibridge.demo', 'pbkdf2_sha256$120000$5130078b92a3f25c4d3c03e553d25118$3b09c874411d4181b7db2c38581e1a32f56b88c6c492feaa4f7c83a031e51fa6', 12.98238, 77.5946, 'busy', now() + interval '70 minutes', 15),
  ('d0c70000-0000-4000-8000-00000000000b', 'Dr. Ananya Rao', 'Emergency Medicine', 'ananya.rao@medibridge.demo', 'pbkdf2_sha256$120000$5130078b92a3f25c4d3c03e553d25118$3b09c874411d4181b7db2c38581e1a32f56b88c6c492feaa4f7c83a031e51fa6', 12.9716, 77.613959, 'available', now() + interval '20 minutes', 15),
  ('d0c70000-0000-4000-8000-00000000000c', 'Dr. Karan Iyer', 'Family Medicine', 'karan.iyer@medibridge.demo', 'pbkdf2_sha256$120000$5130078b92a3f25c4d3c03e553d25118$3b09c874411d4181b7db2c38581e1a32f56b88c6c492feaa4f7c83a031e51fa6', 12.935668, 77.5946, 'available', now() + interval '45 minutes', 15)
on conflict (id) do nothing;
