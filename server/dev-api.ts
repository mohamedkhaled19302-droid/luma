import type { Plugin } from 'vite'
import { chatEndpoint, healthEndpoint, modelsEndpoint } from './ai/endpoints.js'
import { visionEndpoint } from './ai/vision.js'
import { sendJson, type ApiRequestLike, type ApiResponseLike } from './http.js'

/**
 * Read a request body from a raw Node stream.
 *
 * Vercel pre-parses JSON bodies onto `req.body`, but Vite's connect middleware
 * hands over the untouched stream — so buffering happens here, in the dev-only
 * adapter, and the shared handler stays platform-agnostic.
 */
async function bufferBody(
  req: ApiRequestLike & { on?: (event: string, listener: (chunk?: unknown) => void) => void },
): Promise<string | undefined> {
  if (typeof req.on !== 'function') return undefined
  const on = req.on.bind(req)
  return new Promise((resolve) => {
    const chunks: string[] = []
    let settled = false
    const done = (value: string | undefined) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    on('data', (chunk) => {
      if (typeof chunk === 'string') chunks.push(chunk)
      else if (chunk) chunks.push(String(chunk))
    })
    on('end', () => done(chunks.join('')))
    on('error', () => done(undefined))
  })
}

/**
 * Serves `/api/ai/*` from the Vite dev server.
 *
 * The serverless functions in `api/` run the exact same handlers, so the
 * assistant can be developed and tested locally (`npm run dev`). `npm run
 * preview` does not include middleware — use `npm run dev` or a deployed
 * environment to exercise the AI routes.
 */
export function aiDevApi(env: Record<string, string | undefined>): Plugin {
  // The middleware fully owns `/api/ai/*`: it must never call `next()`, or the
  // Vite middlewares downstream would try to write to an already-ended
  // response (write-after-end) and crash the dev server.
  const mount = (handler: (req: ApiRequestLike, res: ApiResponseLike) => Promise<void>) => {
    return async (
      req: ApiRequestLike & { on?: (event: string, listener: (chunk?: unknown) => void) => void },
      res: ApiResponseLike,
    ): Promise<void> => {
      try {
        const raw = await bufferBody(req)
        const withBody: ApiRequestLike = raw ? { ...req, body: raw } : req
        await handler(withBody, res)
      } catch (error) {
        if (!res.writableEnded) {
          sendJson(res, 500, {
            error: {
              code: 'upstream_error',
              message: error instanceof Error ? error.message : 'The AI request failed.',
              retryable: true,
            },
          })
        }
      }
    }
  }

  return {
    name: 'morrow-ai-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        '/api/ai/models',
        mount((req, res) => modelsEndpoint(req, res, { env, requireAuth: false })),
      )
      server.middlewares.use(
        '/api/ai/chat',
        mount((req, res) => chatEndpoint(req, res, { env, requireAuth: false })),
      )
      server.middlewares.use(
        '/api/ai/vision',
        mount((req, res) => visionEndpoint(req, res, { env, requireAuth: false })),
      )
      server.middlewares.use(
        '/api/ai/health',
        mount((req, res) => healthEndpoint(req, res, { env, requireAuth: false })),
      )
    },
  }
}
