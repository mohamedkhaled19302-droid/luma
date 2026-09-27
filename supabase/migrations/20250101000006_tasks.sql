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
