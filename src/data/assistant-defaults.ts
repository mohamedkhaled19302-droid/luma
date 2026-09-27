import type { AssistantPrefs } from '@/types/models'

/**
 * Assistant, voice and privacy preferences.
 *
 * The defaults are the private ones: the microphone is not held open, screens
 * are never watched, and conversations are not kept unless asked for.
 *
 * This lives in its own module rather than in `settings-service` so that the
 * local data layer can seed rows without importing a service that imports the
 * Supabase client, which would form an import cycle.
 */
export const DEFAULT_ASSISTANT_PREFS: AssistantPrefs = {
  enabled: false,
  speak_replies: true,
  wake_word: false,
  wake_phrase: 'hey luma',
  screen_awareness: false,
  keep_conversations: false,
  conversation_days: 30,
  tools_enabled: true,
  model: null,
  planning_style: 'balanced',
  planning_detail: 'normal',
}
