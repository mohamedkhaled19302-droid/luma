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
