-- Wellbeing check-ins: optional, one per day. Used only to shape scheduling.
-- This is a self-report habit tracker, not a medical record: no diagnoses, no
-- clinical claims, nothing beyond a 0-10 self-rating and hours of sleep.
--
-- The 0-10 range must match the sliders in wellbeing.tsx and onboarding.tsx, and
-- the /10 readouts on the dashboard and in insights. An earlier 1-5 constraint
-- here rejected most of what those sliders could actually produce.
--
-- The unique constraint backs the upsert in wellbeing-service.saveCheckin().

create table if not exists public.wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  energy integer check (energy between 0 and 10),
  stress integer check (stress between 0 and 10),
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 24),
  note text,
  created_at timestamptz not null default now(),

  constraint wellbeing_checkins_one_per_day unique (user_id, checkin_date)
);

-- An already-reset table keeps the old check when the file is re-run, so widen
-- it explicitly rather than relying on `create table if not exists`.
alter table public.wellbeing_checkins
  drop constraint if exists wellbeing_checkins_energy_check;
alter table public.wellbeing_checkins
  drop constraint if exists wellbeing_checkins_stress_check;
alter table public.wellbeing_checkins
  add constraint wellbeing_checkins_energy_check check (energy between 0 and 10);
alter table public.wellbeing_checkins
  add constraint wellbeing_checkins_stress_check check (stress between 0 and 10);

alter table public.wellbeing_checkins enable row level security;

create policy "wellbeing_checkins_select_own" on public.wellbeing_checkins
  for select using (auth.uid() = user_id);
create policy "wellbeing_checkins_insert_own" on public.wellbeing_checkins
  for insert with check (auth.uid() = user_id);
create policy "wellbeing_checkins_update_own" on public.wellbeing_checkins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wellbeing_checkins_delete_own" on public.wellbeing_checkins
  for delete using (auth.uid() = user_id);
