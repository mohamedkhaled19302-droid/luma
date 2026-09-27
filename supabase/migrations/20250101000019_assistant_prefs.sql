-- Forward migration: assistant preferences.
--
-- The column was added by editing the `settings` baseline migration, which only
-- helps a database created from scratch. This statement is idempotent, so it is
-- safe on a fresh project and it also repairs a project that was provisioned
-- from the older baseline before `assistant_prefs` existed.
--
-- Two things are corrected here, not just added:
--   1. the column ships OFF. A feature that quietly sends data is not opt-in,
--      so `enabled` defaults to false and the panel asks first;
--   2. rows written by an early build may carry a stray `auto_apply_read_only`
--      key that is not part of the `AssistantPrefs` contract, and rows that
--      predate `tools_enabled` or `model` are missing keys the client reads
--      directly. Merging with `||` fills only the absent keys, so this never
--      overwrites a choice the person has already made.

alter table public.settings
  add column if not exists assistant_prefs jsonb;

-- Backfill every existing row, then enforce NOT NULL + a default.
update public.settings
   set assistant_prefs = coalesce(assistant_prefs, '{}'::jsonb) || '{
     "enabled": false,
     "speak_replies": true,
     "wake_word": false,
     "wake_phrase": "hey morrow",
     "screen_awareness": false,
     "keep_conversations": false,
     "conversation_days": 30,
     "tools_enabled": true,
     "model": null,
     "planning_style": "balanced",
     "planning_detail": "normal"
   }'::jsonb
 where assistant_prefs is null
    or not (assistant_prefs ?& array[
         'enabled',
         'speak_replies',
         'wake_word',
         'wake_phrase',
         'screen_awareness',
         'keep_conversations',
         'conversation_days',
         'tools_enabled',
         'model',
         'planning_style',
         'planning_detail'
       ]);

-- Drop the key that is not part of the client contract.
update public.settings
   set assistant_prefs = assistant_prefs - 'auto_apply_read_only'
 where assistant_prefs ? 'auto_apply_read_only';

alter table public.settings
  alter column assistant_prefs set default '{
    "enabled": false,
    "speak_replies": true,
    "wake_word": false,
    "wake_phrase": "hey morrow",
    "screen_awareness": false,
    "keep_conversations": false,
    "conversation_days": 30,
    "tools_enabled": true,
    "model": null,
    "planning_style": "balanced",
    "planning_detail": "normal"
  }'::jsonb,
  alter column assistant_prefs set not null;
