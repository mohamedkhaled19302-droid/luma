-- Performance indexes for the most common query patterns.
-- Every table already has its user_id index; these cover compound filters.

create index if not exists tasks_user_status_idx
  on public.tasks (user_id, status, created_at desc);

create index if not exists tasks_user_deadline_idx
  on public.tasks (user_id, deadline) where deadline is not null;

create index if not exists tasks_user_subject_idx
  on public.tasks (user_id, subject_id);

create index if not exists tasks_user_scheduled_idx
  on public.tasks (user_id, scheduled_start) where scheduled_start is not null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id) where parent_task_id is not null;

create index if not exists task_sessions_task_idx
  on public.task_sessions (task_id, start_at);

create index if not exists task_sessions_completed_idx
  on public.task_sessions (user_id, completed, start_at);

create index if not exists schedule_blocks_task_idx
  on public.schedule_blocks (task_id) where task_id is not null;

create index if not exists schedule_blocks_event_idx
  on public.schedule_blocks (event_id) where event_id is not null;

create index if not exists schedule_blocks_habit_idx
  on public.schedule_blocks (habit_id) where habit_id is not null;

create index if not exists habits_user_active_idx
  on public.habits (user_id) where active = true;

create index if not exists subjects_user_name_idx
  on public.subjects (user_id, name);