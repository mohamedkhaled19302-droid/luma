import { modelsEndpoint } from '../../server/ai/endpoints.js'
import type { ApiRequestLike, ApiResponseLike } from '../../server/http.js'

/**
 * GET /api/ai/models
 *
 * Returns the currently verified 100%-free model list. Runs on the server so
 * the OpenRouter key (and the verification) never reach the browser.
 *
 * Authenticated and metered like the other AI routes: the list is cached, but
 * it is still a live upstream lookup and must not be an open relay.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike): Promise<void> {
  await modelsEndpoint(req, res, { env: process.env })
}
