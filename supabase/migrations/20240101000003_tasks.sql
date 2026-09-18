-- Tasks.

create type public.task_priority as enum ('low', 'medium', 'high', 'critical');
create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'missed');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  priority public.task_priority not null default 'medium',
  difficulty public.task_difficulty not null default 'medium',
  estimated_minutes integer not null default 60,
  remaining_minutes integer not null default 60,
  deadline timestamptz,
  can_split boolean not null default true,
  status public.task_status not null default 'todo',
  locked boolean not null default false,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  parent_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remaining_minutes_non_negative check (remaining_minutes >= 0)
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