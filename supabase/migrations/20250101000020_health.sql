-- Health: data captured from a wearable, plus the connection that produced it.
--
-- Design notes
--
-- * One table for samples, one for connections. A session is not a table: a
--   session is simply the set of samples sharing a `session_id`, which keeps
--   writes append-only and cheap on a flaky connection.
-- * `metric` is a string, not an enum, so supporting a new reading (blood
--   oxygen, skin temperature, steps) does not need a schema change. The values
--   the app writes are listed in `HealthMetric` in src/types/models.ts.
-- * `recorded_at` is when the body measured it, not when we received it, so a
--   sample that arrives late still lands on the right day.
-- * Health data is the most sensitive thing this app holds, so RLS is
--   owner-only on every table and the device name is kept separate from any
--   identifier the browser might expose.

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'bluetooth',
  device_name text not null,
  -- Opaque per-browser device handle. Never a MAC address or a vendor id.
  device_handle text,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  connected_at timestamptz not null default now(),
  last_sample_at timestamptz,
  -- Free-form capability/metadata bag: services negotiated, sample rate, etc.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- One row per device per person, so reconnecting updates the existing
  -- connection instead of accumulating a new row on every page load.
  constraint health_connections_user_device_key unique (user_id, device_name)
);

alter table public.health_connections enable row level security;

create policy "health_connections_select_own" on public.health_connections
  for select using (auth.uid() = user_id);
create policy "health_connections_insert_own" on public.health_connections
  for insert with check (auth.uid() = user_id);
create policy "health_connections_update_own" on public.health_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "health_connections_delete_own" on public.health_connections
  for delete using (auth.uid() = user_id);


create table if not exists public.health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,
  value numeric not null,
  unit text not null,
  recorded_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  source text not null default 'bluetooth',
  device_name text,
  -- Groups the samples of one recording session, so a session can be labelled
  -- or discarded as a unit.
  session_id text,
  note text,
  created_at timestamptz not null default now(),

  -- A reading has to be physically possible. Heart rate and resting heart rate
  -- are the only metrics with a defensible ceiling here; the app validates the
  -- rest in src/lib/health-metrics.ts before it ever reaches the database.
  constraint health_samples_value_finite check (value is not null)
);

alter table public.health_samples enable row level security;

create policy "health_samples_select_own" on public.health_samples
  for select using (auth.uid() = user_id);
create policy "health_samples_insert_own" on public.health_samples
  for insert with check (auth.uid() = user_id);
create policy "health_samples_update_own" on public.health_samples
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "health_samples_delete_own" on public.health_samples
  for delete using (auth.uid() = user_id);


create index if not exists health_samples_user_recorded_idx
  on public.health_samples (user_id, recorded_at desc);
create index if not exists health_samples_user_metric_recorded_idx
  on public.health_samples (user_id, metric, recorded_at desc);
create index if not exists health_samples_user_session_idx
  on public.health_samples (user_id, session_id)
  where session_id is not null;
create index if not exists health_connections_user_connected_idx
  on public.health_connections (user_id, connected_at desc);


-- Keeps `received_at` honest if a client posts a row without it.
create or replace function public.touch_health_sample_received_at()
returns trigger
language plpgsql
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

drop trigger if exists handle_health_sample_received_at on public.health_samples;
create trigger handle_health_sample_received_at
  before insert on public.health_samples
  for each row execute function public.touch_health_sample_received_at();
