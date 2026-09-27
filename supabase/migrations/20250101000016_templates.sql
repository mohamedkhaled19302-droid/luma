-- Planning templates: reusable plans a user can apply in one tap, plus an
-- optional public gallery.
--
-- A template's `tasks` is a jsonb array of task shapes, stored against this
-- generic schema. `category` is a presentation label for the gallery, not a
-- tasks.category_id - it matches TemplateCategory in src/lib/planning-templates.ts.

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default U&'\2728',
  description text,
  category text not null default 'life'
    check (category in ('sprint', 'project', 'focus', 'wellbeing', 'life')),
  tasks jsonb not null default '[]'::jsonb,
  author_name text not null default '',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint templates_name_not_blank check (length(btrim(name)) > 0),
  -- A malformed template would fail at apply time with a confusing error, so
  -- reject the shape at write time instead.
  constraint templates_tasks_is_array check (jsonb_typeof(tasks) = 'array')
);

alter table public.templates enable row level security;

-- Owners have full CRUD over their own rows.
create policy "templates_select_own" on public.templates
  for select using (auth.uid() = user_id);
create policy "templates_insert_own" on public.templates
  for insert with check (auth.uid() = user_id);
create policy "templates_update_own" on public.templates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates_delete_own" on public.templates
  for delete using (auth.uid() = user_id);

-- Every signed-in user can read public templates. RLS defaults to deny, so
-- private rows stay visible only to their owner.
create policy "templates_select_public" on public.templates
  for select using (is_public = true);

create index templates_public_idx
  on public.templates (is_public, created_at desc);

create trigger handle_templates_updated_at
  before update on public.templates
  for each row execute function moddatetime(updated_at);
