-- Categories: free-form labels used to group tasks and colour the day.
-- Replaces the old `subjects` table. A user might have "Work", "Health",
-- "Home", "Learning", "Side project" - names are chosen by the person, not
-- constrained to a course list.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),

  -- Keeps the category list tidy and makes "add" idempotent per user.
  constraint categories_user_name_key unique (user_id, name),
  constraint categories_name_not_blank check (length(btrim(name)) > 0)
);

alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);

create index categories_user_name_idx on public.categories (user_id, name);
