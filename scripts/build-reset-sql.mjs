/**
 * Build supabase/reset-to-2025.sql from the migration files.
 *
 * Why a generator
 *
 * The reset script is a destructive concatenation of every migration, and it has
 * to stay byte-for-byte in step with supabase/migrations/. Editing it by hand is
 * how you end up shipping a reset that silently omits the one constraint you just
 * fixed. This rebuilds it from the sources of truth, so the fix lands in the reset
 * the moment it lands in the migration.
 *
 * Usage
 *
 *   node scripts/build-reset-sql.mjs
 *
 * Then paste the result into Supabase Dashboard > SQL Editor > Run.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const outFile = join(root, 'supabase', 'reset-to-2025.sql')

const HEADER = `-- =============================================================================
-- LUMA: reset the database to the 2025 schema.
-- =============================================================================
--
-- GENERATED FILE - do not edit by hand.
-- Rebuild it with: node scripts/build-reset-sql.mjs
--
-- WHY THIS SCRIPT EXISTS
--
-- The previous database was built from the 2024 "academic" schema, which had a
-- \`subjects\` table and \`settings.preferred_study_start\` / \`_end\`. The 2025
-- schema replaced those with \`categories\`, \`settings.focus_start\` / \`focus_end\`
-- and an \`assistant_prefs\` column.
--
-- Every 2025 migration starts with \`create table if not exists\`, so running them
-- against the old database silently SKIPS every table that already exists. That
-- leaves \`tasks.subject_id\` in place instead of \`tasks.category_id\`, and the
-- app fails on nearly every query while looking like it installed fine. This is
-- why the migrations have to be applied to an empty database, exactly as
-- supabase/migrations/20250101000000_extensions.sql documents.
--
-- WHAT IT DOES
--
-- Drops the \`public\` schema and recreates it, then applies every migration in
-- supabase/migrations/ in order, then restores the grants Supabase needs.
--
-- WARNING: THIS DELETES ALL DATA IN THE PUBLIC SCHEMA.
--     Sign-ups live in the \`auth\` schema and are NOT touched, but every
--     profile, task, habit, goal, plan, block, check-in and notification is.
--     Do not run this on a database you care about.
--
-- HOW TO RUN
--
-- Supabase Dashboard > SQL Editor > New query > paste > Run. It takes a few
-- seconds. The project is \`qqpjfvpdkuavgzpfmtad\`.
--
-- Re-running is safe: it rebuilds from the migration files either way.
-- =============================================================================

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;

`

const FOOTER = `
-- =============================================================================
-- Grants Supabase expects on a hand-recreated schema.
--
-- The dashboard usually applies these for you; a \`drop schema\` removes them, so
-- they are restored here. Without the table grants, PostgREST returns
-- "permission denied for table ..." even though the tables and policies exist.
-- =============================================================================

grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;

-- =============================================================================
-- Verification. Run these separately afterwards; every 'found' should be 1.
-- =============================================================================

-- select 'categories' as check, count(*) as found from information_schema.tables
--   where table_schema = 'public' and table_name = 'categories';
-- select 'templates' as check, count(*) as found from information_schema.tables
--   where table_schema = 'public' and table_name = 'templates';
-- select 'settings.focus_start' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'settings' and column_name = 'focus_start';
-- select 'settings.assistant_prefs' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'settings' and column_name = 'assistant_prefs';
-- select 'tasks.category_id' as check, count(*) as found from information_schema.columns
--   where table_schema = 'public' and table_name = 'tasks' and column_name = 'category_id';
-- select 'wellbeing energy 0-10' as check, count(*) as found
--   from pg_constraint
--   where conname = 'wellbeing_checkins_energy_check'
--     and pg_get_constraintdef(oid) like '%0%' and pg_get_constraintdef(oid) like '%10%';
`

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  // The timestamp prefix is what defines the order, so sort on it and ignore
  // anything that is not a numbered migration.
  .sort((a, b) => a.localeCompare(b))

if (files.length === 0) {
  console.error('No migrations found in supabase/migrations.')
  process.exit(1)
}

const parts = [HEADER, '\n-- =============================================================================\n-- Migration files, in order.\n-- =============================================================================\n']

for (const name of files) {
  const body = await readFile(join(migrationsDir, name), 'utf8')
  parts.push(`
-- -----------------------------------------------------------------------------
-- ${name}
-- -----------------------------------------------------------------------------
${body.trimEnd()}
`)
}

parts.push(FOOTER)

await writeFile(outFile, parts.join('\n'), 'utf8')

console.log(`Wrote ${outFile}`)
console.log(`Included ${files.length} migrations:`)
for (const name of files) console.log(`  - ${name}`)
