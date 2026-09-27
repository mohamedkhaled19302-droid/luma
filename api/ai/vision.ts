import type { ApiRequestLike, ApiResponseLike } from '../../server/http.js'
import { visionEndpoint } from '../../server/ai/vision.js'

/**
 * POST /api/ai/vision
 *
 * Screen understanding. Reachable only with an explicit, user-initiated capture,
 * and only ever answered by a model the live catalogue still reports as free.
 */
export default async function handler(req: ApiRequestLike, res: ApiResponseLike): Promise<void> {
  await visionEndpoint(req, res, { env: process.env })
}
