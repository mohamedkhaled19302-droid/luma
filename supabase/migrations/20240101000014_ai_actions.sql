-- AI actions: structured actions proposed by the AI layer. They are stored
-- as proposals only ever become active after the user accepts them. The AI
-- NEVER writes to scheduling tables directly.

create type public.ai_action_status as enum ('proposed', 'accepted', 'rejected');

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  payload jsonb,
  status public.ai_action_status not null default 'proposed',
  applied boolean not null default false,
  explanation text,
  created_at timestamptz not null default now()
);

alter table public.ai_actions enable row level security;

create policy "ai_actions_select_own" on public.ai_actions
  for select using (auth.uid() = user_id);
create policy "ai_actions_insert_own" on public.ai_actions
  for insert with check (auth.uid() = user_id);
create policy "ai_actions_update_own" on public.ai_actions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_actions_delete_own" on public.ai_actions
  for delete using (auth.uid() = user_id);

create index ai_actions_user_status_idx on public.ai_actions (user_id, status, created_at desc);