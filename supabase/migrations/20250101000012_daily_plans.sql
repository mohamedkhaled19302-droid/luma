-- Daily plans: one row per user per day holding the balance score for that day.
-- The unique constraint backs the upsert in block-service.saveDailyPlan().

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  balance_score integer not null default 50,
  generated_at timestamptz not null default now(),

  constraint daily_plans_one_per_day unique (user_id, plan_date),
  constraint daily_plans_balance_range check (balance_score between 0 and 100)
);

alter table public.daily_plans enable row level security;

create policy "daily_plans_select_own" on public.daily_plans
  for select using (auth.uid() = user_id);
create policy "daily_plans_insert_own" on public.daily_plans
  for insert with check (auth.uid() = user_id);
create policy "daily_plans_update_own" on public.daily_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_plans_delete_own" on public.daily_plans
  for delete using (auth.uid() = user_id);
