-- LUMA baseline schema.
--
-- This directory is a clean rewrite: it describes the entire database from zero
-- for a personal planner that works for anyone, not just students. There are no
-- roles, classes, attendance or subjects. `categories` replaces `subjects` as a
-- free-form label ("Work", "Health", "Home", "Learning", or anything else).
--
-- Apply to an empty database (`supabase db reset`, or a fresh Supabase project).
-- A database created from the previous, academic schema must be dropped or
-- rebuilt rather than migrated in place, because enum types and column names
-- changed.

-- Required extensions. `pgcrypto` provides gen_random_uuid(); `moddatetime`
-- maintains the updated_at columns.
create extension if not exists pgcrypto;
create extension if not exists moddatetime;
