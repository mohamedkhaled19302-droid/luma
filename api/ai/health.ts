import { healthEndpoint } from '../../server/ai/endpoints.js'
import type { ApiRequestLike, ApiResponseLike } from '../../server/http.js'

/**
 * POST /api/ai/health
 *
 * Turns the caller's own wearable summary into practical guidance. The browser
 * sends the summary; this function never reads the health tables, so the
 * assistant's "no database access" boundary still holds for health data.
 *
 * Auth and per-account rate limiting are enforced here, on the same budget as
 * text chat, so the health guide cannot be used to burn the free allowance.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike): Promise<void> {
  await healthEndpoint(req, res, { env: process.env })
}
