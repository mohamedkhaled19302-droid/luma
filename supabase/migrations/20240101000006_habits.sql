-- Habits.

create type public.habit_frequency as enum ('daily', 'weekly');

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency public.habit_frequency not null default 'daily',
  target_per_week integer not null default 0,
  preferred_time time,
  estimated_minutes integer not null default 30,
  color text not null default '#8b5cf6',
  active boolean not null default true,
  created_at timestamptz not null default now()
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

create index habits_user_id_idx on public.habits (user_id);