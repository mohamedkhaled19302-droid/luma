-- Calendar events: school, commitments, appointments, exams.

create type public.event_type as enum ('school', 'commitment', 'appointment', 'exam', 'other');

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  event_type public.event_type not null default 'commitment',
  locked boolean not null default true,
  location text,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  constraint events_end_after_start check (end_at > start_at)
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

create index calendar_events_user_id_start_idx on public.calendar_events (user_id, start_at);