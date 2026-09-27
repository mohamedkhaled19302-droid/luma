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
