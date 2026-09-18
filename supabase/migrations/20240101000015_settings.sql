-- Settings: preferences per user. A row is auto-created on signup by the
-- handle_new_user trigger.

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sleep_target_hours numeric(3, 1) not null default 8,
  break_every_minutes integer not null default 60,
  break_minutes integer not null default 10,
  preferred_study_start time not null default '08:00',
  preferred_study_end time not null default '22:00',
  max_session_minutes integer not null default 90,
  wake_time time not null default '07:00',
  bed_time time not null default '23:00',
  energy_pref boolean not null default false,
  notification_prefs jsonb not null default '{
    "deadlines": true,
    "tasks": true,
    "schedule_change": true,
    "missed_task": true,
    "habits": true
  }'::jsonb,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  onboarded boolean not null default false,
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings
  for delete using (auth.uid() = user_id);

create trigger handle_settings_updated_at
  before update on public.settings
  for each row execute function moddatetime(updated_at);