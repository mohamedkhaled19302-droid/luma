-- Settings: one row per user, auto-created on signup.
-- `focus_start` / `focus_end` are the hours the user actually wants demanding
-- work planned in. Defaults are a wide, safe 08:00-22:00 window; onboarding
-- narrows it to the hours that person reports they are available.

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sleep_target_hours numeric(3, 1) not null default 8,
  break_every_minutes integer not null default 60,
  break_minutes integer not null default 10,
  focus_start time not null default '08:00',
  focus_end time not null default '22:00',
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

  -- AI / voice / privacy preferences.
  --
  -- One jsonb column rather than a dozen scalars, because this is a sparse,
  -- rarely-read preference bag and it keeps the migration surface small.
  --
  -- Privacy defaults are deliberately conservative and all opt-in:
  --   * the assistant itself is OFF, so a fresh account sends nothing until the
  --     person explicitly turns it on after being told what is shared;
  --   * the wake word is OFF (the browser must not hold the mic open by default);
  --   * screen sharing is OFF and must be triggered by hand every single time;
  --   * `keep_conversations` is OFF, so assistant history is not persisted
  --     unless the person asks for it.
  assistant_prefs jsonb not null default '{
    "enabled": false,
    "speak_replies": true,
    "wake_word": false,
    "wake_phrase": "hey morrow",
    "screen_awareness": false,
    "keep_conversations": false,
    "conversation_days": 30,
    "tools_enabled": true,
    "model": null,
    "planning_style": "balanced",
    "planning_detail": "normal"
  }'::jsonb,
  updated_at timestamptz not null default now(),

  -- Guard rails the scheduler relies on. The client validates these too, but
  -- the database is the last line of defence.
  constraint settings_sleep_target_range check (sleep_target_hours between 4 and 14),
  constraint settings_break_every_positive check (break_every_minutes between 5 and 240),
  constraint settings_break_minutes_range check (break_minutes between 1 and 60),
  constraint settings_max_session_range check (max_session_minutes between 10 and 480)
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
