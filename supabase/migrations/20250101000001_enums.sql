-- Every enum in the schema, declared once so the allowed values are easy to
-- audit in one place. Values here are the contract the TypeScript unions in
-- src/types/models.ts rely on.

-- How urgent something is, and how much effort it takes.
create type public.task_priority as enum ('low', 'medium', 'high', 'critical');
create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'missed');

-- A block in the day timeline.
--   fixed       - immovable recurring structure (a shift, a training slot)
--   task        - work on a specific task
--   focus       - focus time not tied to one task
--   habit       - a habit slot
--   break       - a rest break between focus sessions
--   appointment - a one-off immovable appointment
--   free        - unscheduled time the user is welcome to use
--   sleep       - protected rest
create type public.block_type as enum (
  'fixed', 'task', 'focus', 'habit', 'break', 'appointment', 'free', 'sleep'
);

-- A calendar event. `fixed` is recurring structure, `milestone` is a one-off
-- hard deadline the scheduler plans backwards from.
create type public.event_type as enum ('fixed', 'appointment', 'milestone', 'other');

create type public.habit_frequency as enum ('daily', 'weekly');
create type public.goal_status as enum ('active', 'achieved', 'abandoned');

create type public.notification_type as enum (
  'deadline', 'task', 'schedule_change', 'missed_task', 'habit', 'system'
);
