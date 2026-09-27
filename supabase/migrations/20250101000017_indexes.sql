-- Indexes for the queries the app actually runs.
--
-- Several tables already have a unique constraint that covers the common
-- (user_id, ...) lookup - categories, daily_plans, habit_logs,
-- wellbeing_checkins and notifications - so no redundant user_id index is
-- created for them. Partial indexes are used where a column is usually null,
-- since indexing the null rows would only bloat the index.

create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status, created_at desc);

create index if not exists tasks_user_deadline_idx
  on public.tasks (user_id, deadline) where deadline is not null;

create index if not exists tasks_user_category_idx
  on public.tasks (user_id, category_id);

create index if not exists tasks_user_scheduled_idx
  on public.tasks (user_id, scheduled_start) where scheduled_start is not null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id) where parent_task_id is not null;

create index if not exists task_sessions_user_start_idx
  on public.task_sessions (user_id, start_at);

create index if not exists task_sessions_task_idx
  on public.task_sessions (task_id, start_at);

create index if not exists task_sessions_completed_idx
  on public.task_sessions (user_id, completed, start_at);

create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_at);

create index if not exists schedule_blocks_user_date_idx
  on public.schedule_blocks (user_id, plan_date);

create index if not exists schedule_blocks_user_start_idx
  on public.schedule_blocks (user_id, start_at);

create index if not exists schedule_blocks_task_idx
  on public.schedule_blocks (task_id) where task_id is not null;

create index if not exists schedule_blocks_event_idx
  on public.schedule_blocks (event_id) where event_id is not null;

create index if not exists schedule_blocks_habit_idx
  on public.schedule_blocks (habit_id) where habit_id is not null;

create index if not exists habits_user_active_idx
  on public.habits (user_id) where active = true;

create index if not exists goals_user_idx
  on public.goals (user_id, created_at desc);

create index if not exists notifications_user_read_idx
  on public.notifications (user_id, read, created_at desc);

create index if not exists notifications_user_deadline_idx
  on public.notifications (user_id, deadline_at desc) where deadline_at is not null;

create index if not exists templates_user_idx
  on public.templates (user_id, created_at desc);
