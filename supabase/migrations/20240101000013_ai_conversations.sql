-- AI conversations: one row per message. Users can delete these at any time.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;

create policy "ai_conversations_select_own" on public.ai_conversations
  for select using (auth.uid() = user_id);
create policy "ai_conversations_insert_own" on public.ai_conversations
  for insert with check (auth.uid() = user_id);
create policy "ai_conversations_update_own" on public.ai_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete using (auth.uid() = user_id);

create index ai_conversations_user_created_idx on public.ai_conversations (user_id, created_at);