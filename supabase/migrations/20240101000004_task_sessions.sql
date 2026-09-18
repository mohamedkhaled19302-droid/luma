-- Task sessions: individual planned/completed study sessions for a task.

create table if not exists public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 30,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint sessions_end_after_start check (end_at > start_at)
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

create index task_sessions_user_id_idx on public.task_sessions (user_id, start_at);