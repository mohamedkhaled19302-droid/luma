# Morrow

> Plan your life. Not just your tasks.

Morrow is an offline-first personal planner. It turns deadlines, habits, energy and free time
into a calm weekly schedule — then reshapes it around the life you actually want to live.

Nothing here is student-specific: tasks group into **categories** you name yourself (Work,
Health, Home, Learning, Side project, or anything else), and the scheduler plans around
whatever commitments you actually have.

## Highlights

- **Deterministic scheduler core** (`src/scheduler`) — pure, testable functions that plan your
  week around commitments, sleep, energy and free time. No randomness, no black box.
- **On-device Plan Assistant** — a command center that adds, deletes and completes tasks,
  plans your day and opens focus sessions. Everything runs locally; nothing is sent to a cloud AI.
- **Offline-first** — IndexedDB-backed query cache, a queued mutation service, and a PWA service
  worker keep Morrow usable on an unreliable connection and sync when you're back online.
- **Deadline pressure & balance** — the scheduler scores tasks by urgency, priority, difficulty
  and energy fit, and scores each day's balance between focus, breaks, habits and free time.
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

### Supabase

The app expects a Supabase project. The migrations under `supabase/migrations` build the whole
schema from zero: profiles, settings, categories, tasks, task sessions, calendar events, habits,
habit logs, goals, daily plans, schedule blocks, wellbeing check-ins, notifications and the
template gallery. Every table is RLS-protected to its owner, except public templates.

```bash
npm run supabase:start      # start local Supabase
npm run supabase:migrate    # apply migrations
```

The schema is a clean baseline: apply it to an **empty** database. A database created from an
earlier, student-only version of this app should be dropped or rebuilt rather than migrated in
place, because enum values and column names changed.

Configuration is via environment variables — see `.env.example`.

## Architecture

```
src/
  scheduler/   deterministic planning engine (types, time, score, balance, engine, pressure, missed)
  services/    data access (tasks, blocks, habits), query cache, backup/restore
  hooks/       TanStack Query hooks for data + mutations (offline-aware)
  storage/     IndexedDB helpers (query cache)
  components/  ui primitives + shared components
  pages/       route screens
  layouts/     app shell with offline banner, notifications, theme
  lib/         brand, theme, navigation, offline sync queue, utilities
```

## Testing

`npm test` runs the deterministic scheduler tests (time helpers, day-balance scoring, end-to-end
scheduling: empty days, awake-window placement, multi-task plans, overload reporting, zero-work
tasks), plus the assistant parser, deadline service, data portability and accessibility checks.

## License

Private project. All rights reserved.
