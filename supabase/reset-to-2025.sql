-- =============================================================================
-- LUMA: reset the database to the 2025 schema.
-- =============================================================================
--
-- GENERATED FILE - do not edit by hand.
-- Rebuild it with: node scripts/build-reset-sql.mjs
--
-- WHY THIS SCRIPT EXISTS
--
-- The previous database was built from the 2024 "academic" schema, which had a
-- `subjects` table and `settings.preferred_study_start` / `_end`. The 2025
-- schema replaced those with `categories`, `settings.focus_start` / `focus_end`
-- and an `assistant_prefs` column.
--
-- Every 2025 migration starts with `create table if not exists`, so running them
-- against the old database silently SKIPS every table that already exists. That
-- leaves `tasks.subject_id` in place instead of `tasks.category_id`, and the
-- app fails on nearly every query while looking like it installed fine. This is
-- why the migrations have to be applied to an empty database, exactly as
-- supabase/migrations/20250101000000_extensions.sql documents.
--
-- WHAT IT DOES
--
-- Drops the `public` schema and recreates it, then applies every migration in
-- supabase/migrations/ in order, then restores the grants Supabase needs.
--
-- WARNING: THIS DELETES ALL DATA IN THE PUBLIC SCHEMA.
--     Sign-ups live in the `auth` schema and are NOT touched, but every
--     profile, task, habit, goal, plan, block, check-in and notification is.
--     Do not run this on a database you care about.
--
-- HOW TO RUN
--
-- Supabase Dashboard > SQL Editor > New query > paste > Run. It takes a few
-- seconds. The project is `qqpjfvpdkuavgzpfmtad`.
--
-- Re-running is safe: it rebuilds from the migration files either way.
-- =============================================================================

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;



-- =============================================================================
-- Migration files, in order.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 20250101000000_extensions.sql
-- -----------------------------------------------------------------------------
-- LUMA baseline schema.
--
-- This directory is a clean rewrite: it describes the entire database from zero
-- for a personal planner that works for anyone, not just students. There are no
-- roles, classes, attendance or subjects. `categories` replaces `subjects` as a
-- free-form label ("Work", "Health", "Home", "Learning", or anything else).
--
-- Apply to an empty database (`supabase db reset`, or a fresh Supabase project).
-- A database created from the previous, academic schema must be dropped or
-- rebuilt rather than migrated in place, because enum types and column names
-- changed.

-- Required extensions. `pgcrypto` provides gen_random_uuid(); `moddatetime`
-- maintains the updated_at columns.
create extension if not exists pgcrypto;
create extension if not exists moddatetime;


-- -----------------------------------------------------------------------------
-- 20250101000001_enums.sql
-- -----------------------------------------------------------------------------
-- Every enum in the schema, declared once so the allowed values are easy to
-- audit in one place. Values here are the contract the TypeScript unions in
-- src/types/models.ts rely on.

-- How urgent something is, and how much effort it takes.
create type public.task_priority as enum ('low', 'medium', 'high', 'critical');
create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'missed');

-- A block in the day timeline.
--   fixed       - immovable recurring structure (a shift, a training slot)
--   task        - work on a specific task
--   focus       - focus time not tied to one task
--   habit       - a habit slot
--   break       - a rest break between focus sessions
--   appointment - a one-off immovable appointment
--   free        - unscheduled time the user is welcome to use
--   sleep       - protected rest
create type public.block_type as enum (
  'fixed', 'task', 'focus', 'habit', 'break', 'appointment', 'free', 'sleep'
);

-- A calendar event. `fixed` is recurring structure, `milestone` is a one-off
-- hard deadline the scheduler plans backwards from.
create type public.event_type as enum ('fixed', 'appointment', 'milestone', 'other');

create type public.habit_frequency as enum ('daily', 'weekly');
create type public.goal_status as enum ('active', 'achieved', 'abandoned');

create type public.notification_type as enum (
  'deadline', 'task', 'schedule_change', 'missed_task', 'habit', 'system'
);


-- -----------------------------------------------------------------------------
-- 20250101000002_profiles.sql
-- -----------------------------------------------------------------------------
-- Profiles: one row per auth user. Deliberately minimal - the app only needs a
-- display name. No role, year of study, or any other academic field.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Empty rather than a placeholder like "Student": the UI falls back to a
  -- neutral greeting until onboarding fills it in.
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute function moddatetime(updated_at);


-- -----------------------------------------------------------------------------
-- 20250101000003_settings.sql
-- -----------------------------------------------------------------------------
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
    "wake_phrase": "hey luma",
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


-- -----------------------------------------------------------------------------
-- 20250101000004_auth_triggers.sql
-- -----------------------------------------------------------------------------
-- Auth triggers.
--
-- Split out from the table definitions so `handle_new_user` is only created
-- once every table it writes to exists.

-- Create the profile and settings rows for a new signup. Runs as the auth
-- service, so it needs SECURITY DEFINER to write rows the caller cannot insert
-- directly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for any auth user that predates the trigger above. Idempotent.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.settings (user_id)
select u.id
from auth.users u
where not exists (select 1 from public.settings s where s.user_id = u.id);


-- -----------------------------------------------------------------------------
-- 20250101000005_categories.sql
-- -----------------------------------------------------------------------------
-- Categories: free-form labels used to group tasks and colour the day.
-- Replaces the old `subjects` table. A user might have "Work", "Health",
-- "Home", "Learning", "Side project" - names are chosen by the person, not
-- constrained to a course list.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),

  -- Keeps the category list tidy and makes "add" idempotent per user.
  constraint categories_user_name_key unique (user_id, name),
  constraint categories_name_not_blank check (length(btrim(name)) > 0)
);

alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

create index categories_user_name_idx on public.categories (user_id, name);


-- -----------------------------------------------------------------------------
-- 20250101000006_tasks.sql
-- -----------------------------------------------------------------------------
-- Tasks: the unit of work the scheduler plans.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  difficulty public.task_difficulty not null default 'medium',
  estimated_minutes integer not null default 60,
  remaining_minutes integer not null default 60,
  deadline timestamptz,
  can_split boolean not null default true,
  status public.task_status not null default 'todo',
  -- A locked task keeps its slot when the day is re-planned.
  locked boolean not null default false,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  -- Set when a task is broken into parts across several days.
  parent_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_title_not_blank check (length(btrim(title)) > 0),
  constraint tasks_estimated_positive check (estimated_minutes > 0),
  constraint remaining_minutes_non_negative check (remaining_minutes >= 0),
  -- A split child never outlives its parent, and nothing can parent itself.
  constraint tasks_not_own_parent check (parent_task_id is null or parent_task_id <> id)
);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

create trigger handle_tasks_updated_at
  before update on public.tasks
  for each row execute function moddatetime(updated_at);


-- -----------------------------------------------------------------------------
-- 20250101000007_task_sessions.sql
-- -----------------------------------------------------------------------------
-- Task sessions: logged focus sessions against a task. Drives time actually
-- spent, which the scheduler compares against the estimate to learn.

create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 30,
  completed boolean not null default false,
  created_at timestamptz not null default now(),

  constraint sessions_end_after_start check (end_at > start_at),
  constraint sessions_duration_positive check (duration_minutes > 0)
);

alter table public.task_sessions enable row level security;

create policy "task_sessions_select_own" on public.task_sessions
  for select using (auth.uid() = user_id);
create policy "task_sessions_insert_own" on public.task_sessions
  for insert with check (auth.uid() = user_id);
create policy "task_sessions_update_own" on public.task_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task_sessions_delete_own" on public.task_sessions
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000008_calendar_events.sql
-- -----------------------------------------------------------------------------
-- Calendar events: the commitments the scheduler must plan around.
-- Replaces the old school/exam vocabulary: `fixed` is recurring structure
-- (a shift, a regular training slot), `appointment` is a one-off immovable
-- booking, `milestone` is a hard deadline with no duration.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  event_type public.event_type not null default 'fixed',
  -- Locked by default: an event on the calendar is something the day is built
  -- around, not something the scheduler may move.
  locked boolean not null default true,
  location text,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),

  constraint events_title_not_blank check (length(btrim(title)) > 0),
  -- All-day events are stored as midnight-to-midnight, so a strict > would
  -- reject a legitimate full-day entry; anything else must end after it starts.
  constraint events_end_after_start check (all_day or end_at > start_at)
);

alter table public.calendar_events enable row level security;

create policy "calendar_events_select_own" on public.calendar_events
  for select using (auth.uid() = user_id);
create policy "calendar_events_insert_own" on public.calendar_events
  for insert with check (auth.uid() = user_id);
create policy "calendar_events_update_own" on public.calendar_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calendar_events_delete_own" on public.calendar_events
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000009_habits.sql
-- -----------------------------------------------------------------------------
-- Habits: recurring things worth keeping a rhythm on.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency public.habit_frequency not null default 'daily',
  -- 0 means "no weekly target", which is how a daily habit is expressed.
  target_per_week integer not null default 0,
  preferred_time time,
  estimated_minutes integer not null default 30,
  color text not null default '#8b5cf6',
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint habits_name_not_blank check (length(btrim(name)) > 0),
  constraint habits_target_range check (target_per_week between 0 and 7),
  constraint habits_estimated_positive check (estimated_minutes > 0)
);

alter table public.habits enable row level security;

create policy "habits_select_own" on public.habits
  for select using (auth.uid() = user_id);
create policy "habits_insert_own" on public.habits
  for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on public.habits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habits_delete_own" on public.habits
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000010_habit_logs.sql
-- -----------------------------------------------------------------------------
-- Habit logs: one row per habit per day.
--
-- The unique constraint below is load-bearing, not cosmetic: setHabitLog()
-- upserts on (user_id, habit_id, log_date) so toggling a habit is a single
-- atomic statement. Without it, two rapid toggles would each insert a row and
-- leave a duplicate behind.

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),

  constraint habit_logs_one_per_day unique (user_id, habit_id, log_date)
);

alter table public.habit_logs enable row level security;

create policy "habit_logs_select_own" on public.habit_logs
  for select using (auth.uid() = user_id);
create policy "habit_logs_insert_own" on public.habit_logs
  for insert with check (auth.uid() = user_id);
create policy "habit_logs_update_own" on public.habit_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_logs_delete_own" on public.habit_logs
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000011_goals.sql
-- -----------------------------------------------------------------------------
-- Goals: longer-horizon outcomes the daily plan works towards.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),

  constraint goals_title_not_blank check (length(btrim(title)) > 0)
);

alter table public.goals enable row level security;

create policy "goals_select_own" on public.goals
  for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals
  for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000012_daily_plans.sql
-- -----------------------------------------------------------------------------
-- Daily plans: one row per user per day holding the balance score for that day.
-- The unique constraint backs the upsert in block-service.saveDailyPlan().

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  balance_score integer not null default 50,
  generated_at timestamptz not null default now(),

  constraint daily_plans_one_per_day unique (user_id, plan_date),
  constraint daily_plans_balance_range check (balance_score between 0 and 100)
);

alter table public.daily_plans enable row level security;

create policy "daily_plans_select_own" on public.daily_plans
  for select using (auth.uid() = user_id);
create policy "daily_plans_insert_own" on public.daily_plans
  for insert with check (auth.uid() = user_id);
create policy "daily_plans_update_own" on public.daily_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_plans_delete_own" on public.daily_plans
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000013_schedule_blocks.sql
-- -----------------------------------------------------------------------------
-- Schedule blocks: the materialised day timeline. The scheduler writes these;
-- the user can complete, skip, lock or annotate them.

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  block_type public.block_type not null default 'free',
  title text not null default '',
  task_id uuid references public.tasks(id) on delete cascade,
  event_id uuid references public.calendar_events(id) on delete cascade,
  habit_id uuid references public.habits(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  locked boolean not null default false,
  completed boolean not null default false,
  skipped boolean not null default false,
  note text,
  color text,
  created_at timestamptz not null default now(),

  constraint blocks_end_after_start check (end_at > start_at)
);

alter table public.schedule_blocks enable row level security;

create policy "schedule_blocks_select_own" on public.schedule_blocks
  for select using (auth.uid() = user_id);
create policy "schedule_blocks_insert_own" on public.schedule_blocks
  for insert with check (auth.uid() = user_id);
create policy "schedule_blocks_update_own" on public.schedule_blocks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "schedule_blocks_delete_own" on public.schedule_blocks
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000014_wellbeing_checkins.sql
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- 20250101000015_notifications.sql
-- -----------------------------------------------------------------------------
-- Notifications: the in-app feed.
--
-- Deadline reminders reuse this table rather than a separate one. `key` is the
-- dedupe marker (one reminder per deadline per urgency stage) and `deadline_at`
-- stores the due timestamp so the feed can sort and filter by it.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null default 'system',
  title text not null,
  body text not null default '',
  data jsonb,
  read boolean not null default false,
  key text,
  deadline_at timestamptz,
  created_at timestamptz not null default now(),

  -- Enforces the "one reminder per stage" rule in the database, so a retry or
  -- a double-firing scheduler cannot show the same deadline twice.
  constraint notifications_user_key_key unique (user_id, key)
);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
create policy "notifications_insert_own" on public.notifications
  for insert with check (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 20250101000016_templates.sql
-- -----------------------------------------------------------------------------
-- Planning templates: reusable plans a user can apply in one tap, plus an
-- optional public gallery.
--
-- A template's `tasks` is a jsonb array of task shapes, stored against this
-- generic schema. `category` is a presentation label for the gallery, not a
-- tasks.category_id - it matches TemplateCategory in src/lib/planning-templates.ts.

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default U&'\2728',
  description text,
  category text not null default 'life'
    check (category in ('sprint', 'project', 'focus', 'wellbeing', 'life')),
  tasks jsonb not null default '[]'::jsonb,
  author_name text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint templates_name_not_blank check (length(btrim(name)) > 0),
  -- A malformed template would fail at apply time with a confusing error, so
  -- reject the shape at write time instead.
  constraint templates_tasks_is_array check (jsonb_typeof(tasks) = 'array')
);

alter table public.templates enable row level security;

-- Owners have full CRUD over their own rows.
create policy "templates_select_own" on public.templates
  for select using (auth.uid() = user_id);
create policy "templates_insert_own" on public.templates
  for insert with check (auth.uid() = user_id);
create policy "templates_update_own" on public.templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates_delete_own" on public.templates
  for delete using (auth.uid() = user_id);

-- Every signed-in user can read public templates. RLS defaults to deny, so
-- private rows stay visible only to their owner.
create policy "templates_select_public" on public.templates
  for select using (is_public = true);

create index templates_public_idx
  on public.templates (is_public, created_at desc);

create trigger handle_templates_updated_at
  before update on public.templates
  for each row execute function moddatetime(updated_at);


-- -----------------------------------------------------------------------------
-- 20250101000017_indexes.sql
-- -----------------------------------------------------------------------------
-- Indexes for the queries the app actually runs.
--
-- Several tables already have a unique constraint that covers the common
-- (user_id, ...) lookup - categories, daily_plans, habit_logs,
-- wellbeing_checkins and notifications - so no redundant user_id index is
-- created for them. Partial indexes are used where a column is usually null,
-- since indexing the null rows would only bloat the index.

create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status, created_at desc);

create index if not exists tasks_user_deadline_idx
  on public.tasks (user_id, deadline) where deadline is not null;

create index if not exists tasks_user_category_idx
  on public.tasks (user_id, category_id);

create index if not exists tasks_user_scheduled_idx
  on public.tasks (user_id, scheduled_start) where scheduled_start is not null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id) where parent_task_id is not null;

create index if not exists task_sessions_user_start_idx
  on public.task_sessions (user_id, start_at);

create index if not exists task_sessions_task_idx
  on public.task_sessions (task_id, start_at);

create index if not exists task_sessions_completed_idx
  on public.task_sessions (user_id, completed, start_at);

create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_at);

create index if not exists schedule_blocks_user_date_idx
  on public.schedule_blocks (user_id, plan_date);

create index if not exists schedule_blocks_user_start_idx
  on public.schedule_blocks (user_id, start_at);

create index if not exists schedule_blocks_task_idx
  on public.schedule_blocks (task_id) where task_id is not null;

create index if not exists schedule_blocks_event_idx
  on public.schedule_blocks (event_id) where event_id is not null;

create index if not exists schedule_blocks_habit_idx
  on public.schedule_blocks (habit_id) where habit_id is not null;

create index if not exists habits_user_active_idx
  on public.habits (user_id) where active = true;

create index if not exists goals_user_idx
  on public.goals (user_id, created_at desc);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read, created_at desc);

create index if not exists notifications_user_deadline_idx
  on public.notifications (user_id, deadline_at desc) where deadline_at is not null;

create index if not exists templates_user_idx
  on public.templates (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 20250101000018_hardening.sql
-- -----------------------------------------------------------------------------
-- Hardening.
--
-- Two layers, from the October security audit:
--
-- 1) `handle_new_user` runs as SECURITY DEFINER. It is only ever reachable as
--    a trigger, so strip default EXECUTE from the public roles - otherwise any
--    caller could invoke it directly and mint rows for arbitrary user ids.
--
-- 2) Defense in depth: revoke table privileges from `anon`. Row Level Security
--    already blocks anonymous access, but explicit privileges mean a future
--    `create policy` cannot silently hand the anon role access.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke all on table public.profiles from anon;
revoke all on table public.settings from anon;
revoke all on table public.categories from anon;
revoke all on table public.tasks from anon;
revoke all on table public.task_sessions from anon;
revoke all on table public.calendar_events from anon;
revoke all on table public.habits from anon;
revoke all on table public.habit_logs from anon;
revoke all on table public.goals from anon;
revoke all on table public.daily_plans from anon;
revoke all on table public.schedule_blocks from anon;
revoke all on table public.wellbeing_checkins from anon;
revoke all on table public.notifications from anon;
revoke all on table public.templates from anon;


-- -----------------------------------------------------------------------------
-- 20250101000019_assistant_prefs.sql
-- -----------------------------------------------------------------------------
-- Forward migration: assistant preferences.
--
-- The column was added by editing the `settings` baseline migration, which only
-- helps a database created from scratch. This statement is idempotent, so it is
-- safe on a fresh project and it also repairs a project that was provisioned
-- from the older baseline before `assistant_prefs` existed.
--
-- Two things are corrected here, not just added:
--   1. the column ships OFF. A feature that quietly sends data is not opt-in,
--      so `enabled` defaults to false and the panel asks first;
--   2. rows written by an early build may carry a stray `auto_apply_read_only`
--      key that is not part of the `AssistantPrefs` contract, and rows that
--      predate `tools_enabled` or `model` are missing keys the client reads
--      directly. Merging with `||` fills only the absent keys, so this never
--      overwrites a choice the person has already made.

alter table public.settings
  add column if not exists assistant_prefs jsonb;

-- Backfill every existing row, then enforce NOT NULL + a default.
update public.settings
   set assistant_prefs = coalesce(assistant_prefs, '{}'::jsonb) || '{
     "enabled": false,
     "speak_replies": true,
     "wake_word": false,
     "wake_phrase": "hey luma",
     "screen_awareness": false,
     "keep_conversations": false,
     "conversation_days": 30,
     "tools_enabled": true,
     "model": null,
     "planning_style": "balanced",
     "planning_detail": "normal"
   }'::jsonb
 where assistant_prefs is null
    or not (assistant_prefs ?& array[
         'enabled',
         'speak_replies',
         'wake_word',
         'wake_phrase',
         'screen_awareness',
         'keep_conversations',
         'conversation_days',
         'tools_enabled',
         'model',
         'planning_style',
         'planning_detail'
       ]);

-- Drop the key that is not part of the client contract.
update public.settings
   set assistant_prefs = assistant_prefs - 'auto_apply_read_only'
 where assistant_prefs ? 'auto_apply_read_only';

alter table public.settings
  alter column assistant_prefs set default '{
    "enabled": false,
    "speak_replies": true,
    "wake_word": false,
    "wake_phrase": "hey luma",
    "screen_awareness": false,
    "keep_conversations": false,
    "conversation_days": 30,
    "tools_enabled": true,
    "model": null,
    "planning_style": "balanced",
    "planning_detail": "normal"
  }'::jsonb,
  alter column assistant_prefs set not null;


-- -----------------------------------------------------------------------------
-- 20250101000020_health.sql
-- -----------------------------------------------------------------------------
-- Health: data captured from a wearable, plus the connection that produced it.
--
-- Design notes
--
-- * One table for samples, one for connections. A session is not a table: a
--   session is simply the set of samples sharing a `session_id`, which keeps
--   writes append-only and cheap on a flaky connection.
-- * `metric` is a string, not an enum, so supporting a new reading (blood
--   oxygen, skin temperature, steps) does not need a schema change. The values
--   the app writes are listed in `HealthMetric` in src/types/models.ts.
-- * `recorded_at` is when the body measured it, not when we received it, so a
--   sample that arrives late still lands on the right day.
-- * Health data is the most sensitive thing this app holds, so RLS is
--   owner-only on every table and the device name is kept separate from any
--   identifier the browser might expose.

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'bluetooth',
  device_name text not null,
  -- Opaque per-browser device handle. Never a MAC address or a vendor id.
  device_handle text,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  connected_at timestamptz not null default now(),
  last_sample_at timestamptz,
  -- Free-form capability/metadata bag: services negotiated, sample rate, etc.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- One row per device per person, so reconnecting updates the existing
  -- connection instead of accumulating a new row on every page load.
  constraint health_connections_user_device_key unique (user_id, device_name)
);

alter table public.health_connections enable row level security;

create policy "health_connections_select_own" on public.health_connections
  for select using (auth.uid() = user_id);
create policy "health_connections_insert_own" on public.health_connections
  for insert with check (auth.uid() = user_id);
create policy "health_connections_update_own" on public.health_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "health_connections_delete_own" on public.health_connections
  for delete using (auth.uid() = user_id);


create table if not exists public.health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,
  value numeric not null,
  unit text not null,
  recorded_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  source text not null default 'bluetooth',
  device_name text,
  -- Groups the samples of one recording session, so a session can be labelled
  -- or discarded as a unit.
  session_id text,
  note text,
  created_at timestamptz not null default now(),

  -- A reading has to be physically possible. Heart rate and resting heart rate
  -- are the only metrics with a defensible ceiling here; the app validates the
  -- rest in src/lib/health-metrics.ts before it ever reaches the database.
  constraint health_samples_value_finite check (value is not null)
);

alter table public.health_samples enable row level security;

create policy "health_samples_select_own" on public.health_samples
  for select using (auth.uid() = user_id);
create policy "health_samples_insert_own" on public.health_samples
  for insert with check (auth.uid() = user_id);
create policy "health_samples_update_own" on public.health_samples
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "health_samples_delete_own" on public.health_samples
  for delete using (auth.uid() = user_id);


create index if not exists health_samples_user_recorded_idx
  on public.health_samples (user_id, recorded_at desc);
create index if not exists health_samples_user_metric_recorded_idx
  on public.health_samples (user_id, metric, recorded_at desc);
create index if not exists health_samples_user_session_idx
  on public.health_samples (user_id, session_id)
  where session_id is not null;
create index if not exists health_connections_user_connected_idx
  on public.health_connections (user_id, connected_at desc);


-- Keeps `received_at` honest if a client posts a row without it.
create or replace function public.touch_health_sample_received_at()
returns trigger
language plpgsql
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

drop trigger if exists handle_health_sample_received_at on public.health_samples;
create trigger handle_health_sample_received_at
  before insert on public.health_samples
  for each row execute function public.touch_health_sample_received_at();


-- =============================================================================
-- Grants Supabase expects on a hand-recreated schema.
--
-- The dashboard usually applies these for you; a `drop schema` removes them, so
-- they are restored here. Without the table grants, PostgREST returns
-- "permission denied for table ..." even though the tables and policies exist.
-- =============================================================================

grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;

-- =============================================================================
-- Verification. Run these separately afterwards; every 'found' should be 1.
-- =============================================================================

-- select 'categories' as check, count(*) as found from information_schema.tables
--   where table_schema = 'public' and table_name = 'categories';
-- select 'templates' as check, count(*) as found from information_schema.tables
--   where table_schema = 'public' and table_name = 'templates';
-- select 'settings.focus_start' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'settings' and column_name = 'focus_start';
-- select 'settings.assistant_prefs' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'settings' and column_name = 'assistant_prefs';
-- select 'tasks.category_id' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'tasks' and column_name = 'category_id';
-- select 'wellbeing energy 0-10' as check, count(*) as found
--   from pg_constraint
--   where conname = 'wellbeing_checkins_energy_check'
--     and pg_get_constraintdef(oid) like '%0%' and pg_get_constraintdef(oid) like '%10%';
