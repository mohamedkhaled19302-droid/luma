/**
 * Wire contract shared by the browser and the server-side AI proxy.
 *
 * This module must never import anything Node-only and must never hold a
 * secret: the OpenRouter key lives exclusively on the server.
 */

export type PlanningStyleId =
  | 'structured'
  | 'flexible'
  | 'balanced'
  | 'goal-focused'
  | 'minimal'

export type PlanningDetail = 'simple' | 'normal' | 'detailed'

export interface FreeModelInfo {
  /** OpenRouter model id, e.g. `openrouter/free`. */
  id: string
  name: string
  contextLength: number
  /** True for the auto-router alias that only ever selects free models. */
  isRouter?: boolean
}

export type AiModelsSource = 'live' | 'cache' | 'unavailable'

export interface AiModelsResponse {
  /** False when the server has no OPENROUTER_API_KEY configured. */
  hasKey: boolean
  source: AiModelsSource
  /** ISO timestamp of the last successful *live* verification. */
  verifiedAt: string | null
  /** Verified 100%-free chat models, best first. */
  models: FreeModelInfo[]
  defaultModel: string | null
  /** Human-readable note when the list came from cache or is empty. */
  message?: string
}

export type AiErrorCode =
  | 'unauthorized'
  | 'missing_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'free_daily_limit'
  | 'no_free_model'
  | 'model_unavailable'
  | 'upstream_error'
  | 'timeout'
  | 'bad_request'
  | 'network'
  | 'not_configured'

export interface AiErrorResponse {
  error: {
    code: AiErrorCode
    message: string
    /** True when retrying later or switching model may succeed. */
    retryable: boolean
  }
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** The minimum context needed to plan. Sent only when the user is chatting. */
export interface AiPlanningContext {
  displayName?: string
  planningStyle?: PlanningStyleId
  planningDetail?: PlanningDetail
  /** e.g. "Tuesday, 23 September" — avoids sending a raw timestamp. */
  dayLabel?: string
  /** Local wall-clock time, e.g. "14:35". No date, no timezone leak. */
  nowLocal?: string
  awakeStart?: string
  awakeEnd?: string
  /** The hours the user wants to plan demanding work in. */
  focusStart?: string
  focusEnd?: string
  lifeAreas?: string[]
  tasks?: Array<{
    id: string
    title: string
    due?: string
    priority?: string
    minutes?: number
    status?: string
    area?: string
  }>
  blocks?: Array<{
    id: string
    title: string
    start: string
    end: string
    kind: string
    completed?: boolean
  }>
  habits?: Array<{ id: string; name: string; doneToday?: boolean }>
  goals?: Array<{ id: string; title: string; targetDate?: string }>
  /**
   * The entities the last assistant turn talked about. Lets the model resolve
   * "it", "that one" and "move it to Thursday" without guessing.
   */
  recentFocus?: {
    taskIds?: string[]
    blockIds?: string[]
    habitIds?: string[]
    goalIds?: string[]
    /** Verbatim last user utterance, for pronoun resolution. */
    lastUserMessage?: string
  }
  /**
   * True only while the user has an explicit, currently-visible screen share
   * active. The server refuses screen-augmented requests without it.
   */
  screenShareActive?: boolean
}

export interface AiChatRequest {
  messages: AiChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  context?: AiPlanningContext
  /**
   * When true the server may return native tool calls. False keeps the
   * assistant in advisory mode (prose + inert proposals only).
   */
  toolsEnabled?: boolean
  /**
   * Echoed back after the user approves a held destructive tool. The server
   * re-validates `tool`/`args` against its allowlist before releasing it.
   */
  confirm?: { confirmationId: string; tool: AiToolName; args: Record<string, unknown> }
  /** When set, the server returns tool metadata for this request only. */
  includeScreenContext?: boolean
}

/**
 * Every tool the assistant is permitted to invoke. The server owns the
 * executable implementations; the browser only ever receives inert
 * proposals and calls the existing Supabase services itself.
 */
export type AiToolName =
  // read-only
  | 'get_today_summary'
  | 'list_tasks'
  | 'search_planner'
  // tasks
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'reschedule_task'
  | 'delete_task'
  // habits
  | 'create_habit'
  | 'log_habit'
  | 'delete_habit'
  // goals
  | 'create_goal'
  | 'update_goal'
  | 'delete_goal'
  // schedule
  | 'create_block'
  | 'move_block'
  | 'complete_block'
  | 'delete_block'
  | 'reschedule_day'
  | 'add_break'
  // organisation
  | 'create_category'
  | 'delete_category'

/**
 * A concrete change the assistant *suggests*. Suggestions are inert until the
 * user confirms them — the assistant can never mutate data on its own.
 */
export type AiProposalKind = AiToolName

/** Tools that destroy data and therefore always require explicit approval. */
export const AI_DESTRUCTIVE_TOOLS: ReadonlySet<AiToolName> = new Set<AiToolName>([
  'delete_task',
  'delete_habit',
  'delete_goal',
  'delete_block',
  'delete_category',
  'reschedule_day',
])

export function isDestructiveTool(name: string): name is AiToolName {
  return AI_DESTRUCTIVE_TOOLS.has(name as AiToolName)
}

/** JSON-Schema-ish description of one tool parameter, used to render dialogs. */
export interface AiToolParamSpec {
  name: string
  type: 'string' | 'number' | 'boolean' | 'string[]'
  required: boolean
  description: string
  /** Inclusive bounds for numeric parameters. */
  min?: number
  max?: number
  /** Allowed values for string parameters. */
  options?: string[]
}

export interface AiToolDefinition {
  name: AiToolName
  description: string
  params: AiToolParamSpec[]
  destructive: boolean
  /** Tools that only read never need confirmation. */
  readOnly: boolean
}

export interface AiToolsResponse {
  tools: AiToolDefinition[]
}

export interface AiProposal {
  id: string
  kind: AiProposalKind
  /** Short button label, e.g. "Move to tomorrow". */
  title: string
  /** One-line explanation shown under the button. */
  summary?: string
  payload: Record<string, unknown>
  /** True when accepting this proposal deletes or overwrites data. */
  destructive: boolean
}

/**
 * Returned instead of executing when the assistant picks a destructive tool.
 * The client shows a confirmation dialog and re-sends the turn with
 * `confirm.confirmationId` to actually run it.
 */
export interface AiConfirmationRequest {
  confirmationId: string
  tool: AiToolName
  /** e.g. "Delete task?" */
  title: string
  /** Human-readable consequence, e.g. "This permanently removes 'Draft report'." */
  detail: string
  params: Record<string, unknown>
}


export interface AiChatUsage {
  promptTokens?: number
  completionTokens?: number
}

export interface AiChatResponse {
  reply: string
  /** Model that actually produced the reply (may differ from the request). */
  model: string
  /** Always true: the proxy refuses to route to a paid model. */
  free: true
  source: 'live'
  usage?: AiChatUsage
  proposals: AiProposal[]
  /** Non-blocking note, e.g. "switched model because the first was busy". */
  notice?: string
  /** Present when a destructive tool was held back pending user approval. */
  confirmation?: AiConfirmationRequest
  /** Set when the reply was shaped by an explicit screen-context request. */
  usedScreenContext?: boolean
  /** True when the model asked a clarifying question instead of guessing. */
  needsClarification?: boolean
}

/* ------------------------------------------------------------------ *
 * Provider abstraction
 *
 * The UI depends on these interfaces only, so a hosted provider, a
 * local model, or the built-in Web Speech APIs can be swapped in
 * without touching any component.
 * ------------------------------------------------------------------ */

export interface AiCompletionRequest {
  messages: AiChatMessage[]
  model?: string
  context?: AiPlanningContext
  toolsEnabled?: boolean
  signal?: AbortSignal
}

export interface AIProvider {
  readonly id: string
  readonly label: string
  /** False when no credential is configured on the server. */
  isAvailable(): Promise<boolean>
  listModels(): Promise<AiModelsResponse>
  chat(request: AiCompletionRequest): Promise<AiChatResponse>
}

export type VoiceStartMode = 'wake' | 'command'

export interface VoiceSession {
  stop(): void
  readonly active: boolean
}

export interface SpeechToTextProvider {
  readonly id: string
  readonly label: string
  isSupported(): boolean
  /**
   * `wake` mode runs continuously and only surfaces phrases containing the
   * wake word. `command` mode captures a single utterance. Audio is processed
   * by the chosen provider and is never persisted by Morrow.
   */
  start(mode: VoiceStartMode, handlers: VoiceHandlers): VoiceSession
}

export interface VoiceHandlers {
  onWake?(): void
  onPhrase(text: string): void
  onPartial?(text: string): void
  onError?(message: string): void
  onEnd?(): void
}

export interface TextToSpeechProvider {
  readonly id: string
  readonly label: string
  isSupported(): boolean
  speak(text: string): void
  stop(): void
  readonly speaking: boolean
}

export interface WakeWordProvider {
  readonly id: string
  readonly label: string
  /** Phrases that arm the assistant, e.g. "hey morrow". */
  readonly phrases: readonly string[]
  isSupported(): boolean
  /**
   * True when matching happens on-device. Continuous wake listening only
   * exists for local providers — the server is never sent ambient audio.
   */
  readonly local: boolean
}

export interface VisionFrame {
  dataUrl: string
  capturedAt: string
  /** The user's own words about the screen, used to disambiguate. */
  question?: string
}

export interface VisionProvider {
  readonly id: string
  readonly label: string
  isSupported(): boolean
  /**
   * Answers a question about a single explicit screenshot. Never called
   * without a user-initiated capture.
   */
  describe(frame: VisionFrame, question: string, signal?: AbortSignal): Promise<string>
}
