-- Notifications.

create type public.notification_type as enum (
  'deadline', 'task', 'schedule_change', 'missed_task', 'habit', 'system'
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null default 'system',
  title text not null,
  body text not null default '',
  data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
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

create index notifications_user_read_idx on public.notifications (user_id, read, created_at desc);