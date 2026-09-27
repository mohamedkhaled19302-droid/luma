-- Wellbeing check-ins: optional, one per day. Used only to shape scheduling.
-- This is a self-report habit tracker, not a medical record: no diagnoses, no
-- clinical claims, nothing beyond a 1-5 self-rating and hours of sleep.
--
-- The unique constraint backs the upsert in wellbeing-service.saveCheckin().

create table if not exists public.wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  energy integer check (energy between 1 and 5),
  stress integer check (stress between 1 and 5),
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 24),
  note text,
  created_at timestamptz not null default now(),

  constraint wellbeing_checkins_one_per_day unique (user_id, checkin_date)
);

alter table public.wellbeing_checkins enable row level security;

create policy "wellbeing_checkins_select_own" on public.wellbeing_checkins
  for select using (auth.uid() = user_id);
create policy "wellbeing_checkins_insert_own" on public.wellbeing_checkins
  for insert with check (auth.uid() = user_id);
create policy "wellbeing_checkins_update_own" on public.wellbeing_checkins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wellbeing_checkins_delete_own" on public.wellbeing_checkins
  for delete using (auth.uid() = user_id);
