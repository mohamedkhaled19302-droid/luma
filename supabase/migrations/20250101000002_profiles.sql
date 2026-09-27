-- Profiles: one row per auth user. Deliberately minimal - the app only needs a
-- display name. No role, year of study, or any other academic field.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Empty rather than a placeholder like "Student": the UI falls back to a
  -- neutral greeting until onboarding fills it in.
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row execute function moddatetime(updated_at);
