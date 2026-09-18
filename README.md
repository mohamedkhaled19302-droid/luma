# LUMA

> Plan your life. Not just your tasks.

LUMA is an offline-first student life planner. It turns deadlines, habits, energy and free time
into a calm weekly schedule — then reshapes it around the life you actually want to live.

## Highlights

- **Deterministic scheduler core** (`src/scheduler`) — pure, testable functions that plan your
  week around classes, commitments, sleep, energy and free time. No randomness, no black box.
- **AI as a validator, never a writer** — an optional AI layer (`src/ai`) proposes schedule
  actions and explains them; only you (or the deterministic core) apply them.
- **Offline-first** — IndexedDB-backed query cache, a queued mutation service, and a PWA service
  worker keep LUMA usable on a flaky campus Wi-Fi and sync when you're back online.
- **Deadline pressure & balance** — the scheduler scores tasks by urgency, priority, difficulty
  and energy fit, and scores each day's balance between study, breaks, habits and free time.
- **Wellbeing-first** — energy/stress check-ins feed the scheduler so tough work lands in your
  sharp hours and rest stays on the calendar.

## Tech stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · TanStack Query v5 · Supabase (Postgres + Auth)
· IndexedDB · react-router v6 · zod · sonner · lucide-react · vite-plugin-pwa

## Getting started

```bash
npm install
npm run dev          # start the Vite dev server
npm run typecheck    # typecheck the app
npm run lint         # eslint (zero-warnings budget)
npm run test         # unit tests (deterministic scheduler + utils)
npm run build        # typecheck + production build to dist/
```

### Supabase (optional for full functionality)

The app expects a Supabase project. Fifteen-plus migrations under `supabase/migrations`
set up the schema (profiles, subjects, tasks, task sessions, calendar events, habits, habit
logs, goals, daily plans, schedule blocks, wellbeing check-ins, notifications, AI
conversations/actions, user settings). The `ai-planner` edge function lives in
`supabase/functions/ai-planner`.

```bash
npm run supabase:start      # start local Supabase
npm run supabase:migrate    # apply migrations
```

Configuration is via environment variables — see `.env.example`.

## Architecture

```
src/
  scheduler/   deterministic planning engine (types, time, score, balance, engine, pressure, missed)
  ai/          validation-only AI layer (proposals + explanations, never writes)
  services/    data access (tasks, blocks, habits), offline queue, query cache
  hooks/       TanStack Query hooks for data + mutations (offline-aware)
  storage/     IndexedDB helpers (query cache + mutation queue stores)
  components/  ui primitives + shared components
  pages/       route screens
  layouts/     app shell with offline banner, notifications, theme
  lib/         theme, navigation, utilities
```

## Testing

`src/scheduler/__tests__` covers the time helpers, day-balance scoring, and end-to-end
scheduling: empty days, awake-window placement, multi-task plans, overload reporting, and
zero-work tasks.

## License

Private project. All rights reserved.