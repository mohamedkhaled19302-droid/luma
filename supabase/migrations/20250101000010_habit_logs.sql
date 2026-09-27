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
