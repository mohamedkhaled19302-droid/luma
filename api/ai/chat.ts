import { chatEndpoint } from '../../server/ai/endpoints.js'
import type { ApiRequestLike, ApiResponseLike } from '../../server/http.js'

/**
 * POST /api/ai/chat
 *
 * The planning assistant. Every call re-verifies that the chosen model is still
 * 100% free before it is used, and falls back to another free model when one is
 * busy.
 *
 * Authentication and per-account rate limiting are enforced here (they default
 * to on, so omitting `requireAuth` is deliberate). A signed-in member's
 * Supabase access token is validated before any OpenRouter quota is spent.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike): Promise<void> {
  await chatEndpoint(req, res, { env: process.env })
}
