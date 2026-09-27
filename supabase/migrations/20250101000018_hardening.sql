-- Hardening.
--
-- Two layers, from the October security audit:
--
-- 1) `handle_new_user` runs as SECURITY DEFINER. It is only ever reachable as
--    a trigger, so strip default EXECUTE from the public roles - otherwise any
--    caller could invoke it directly and mint rows for arbitrary user ids.
--
-- 2) Defense in depth: revoke table privileges from `anon`. Row Level Security
--    already blocks anonymous access, but explicit privileges mean a future
--    `create policy` cannot silently hand the anon role access.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke all on table public.profiles from anon;
revoke all on table public.settings from anon;
revoke all on table public.categories from anon;
revoke all on table public.tasks from anon;
revoke all on table public.task_sessions from anon;
revoke all on table public.calendar_events from anon;
revoke all on table public.habits from anon;
revoke all on table public.habit_logs from anon;
revoke all on table public.goals from anon;
revoke all on table public.daily_plans from anon;
revoke all on table public.schedule_blocks from anon;
revoke all on table public.wellbeing_checkins from anon;
revoke all on table public.notifications from anon;
revoke all on table public.templates from anon;
