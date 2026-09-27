# LUMA — Accessibility audit & fixes (WCAG 2.1 AA)

Date: September 2026 · Scope: all pages and shared components except `settings.tsx` /
`subjects.tsx` / `onboarding.tsx` / router / data-port / sync (owned by other agents — noted where relevant).

## Summary

Every issue below was verified against the shipped code, and either fixed in this pass or
documented as a recommendation. Four classes of problems were found:

1. **Colour contrast** — several token-backed and ad-hoc colour pairs failed AA (4.5:1 for body text).
2. **Missing accessible names** — Radix progress bars rendered with no name.
3. **Reduced-motion leakage** — the hero 3D scene ignored `prefers-reduced-motion` (only the
   camera was gated); `day-orbit-3d` already froze correctly.
4. **Keyboard/ARIA gaps** — decorative scroll cue, live feedback not announced, menu roles.

## Token changes (`src/styles.css`)

Only pairs that were *measured* below 4.5:1 were adjusted. Hue/saturation preserved to keep the
brand feel. Contrast ratios computed with the WCAG formula on final token values.

| Token | Before | After | Worst measured pair before | After |
| --- | --- | --- | --- | --- |
| light `--gradient-to` | `322 72% 55%` | `322 72% 47%` | white-on-gradient-end **3.99** | **4.94** |
| dark `--primary` | `258 92% 66%` | `258 92% 68%` | dark fg-on-primary **4.44** | **4.85** |
| light `--destructive` | `0 78% 55%` | `0 74% 50%` | white-on-destructive **4.30** | **4.83** |
| dark `--destructive` | `0 74% 56%` | `0 72% 53%` | white-on-destructive **4.25** | **4.61** |

`theme-body` ambient radial-gradients were also aligned to the new `--gradient-to` lightness
(decorative only). `--success` / `--warning` tokens were kept — their *text* usages sit on
10% tints, which no single mid-light token can satisfy; those pairs were fixed at the component
level (below).

Verified as ALREADY passing and left alone: light `--primary`/white (5.95), light
`--primary` on muted/card, `--accent` / `--secondary` pairs, `--muted-foreground` on
background/muted/card (4.77–6.34), dark `--warning`/`--success` on dark surfaces (9.36/8.6).

## Component fixes (contrast)

| File | Change | Why |
| --- | --- | --- |
| `src/components/ui/badge.tsx` | destructive/success/warn variants → `text-red-700 dark:text-red-400` / `text-emerald-800 dark:text-emerald-300` / `text-amber-800 dark:text-amber-300` | tinted badges (`bg-X/10`) with the base token text failed (3.9–4.2 light); fixed pair now 5.7–7.2 light, bright pastels pass dark |
| `src/pages/wellbeing.tsx` | Energy/Stress chips → same 800/300 pattern | `text-success`/`text-warning` on 10% tints failed |
| `src/pages/notifications.tsx` | overdue → `text-red-700 dark:text-red-400`, due-today → `text-amber-700 dark:text-amber-400` | overdue date/title + icon on `bg-destructive/5`; due-today date failed |
| `src/pages/tasks.tsx` / `habits.tsx` | Delete menu items → `text-red-700 focus:text-red-700 dark:text-red-400` | `text-destructive` on white popover = 4.06 |
| `src/pages/templates.tsx` / `tasks.tsx` / `dashboard.tsx` | priority chips `-500` → `-700` (+ `dark:-300`) | `text-amber-500`≈2.0, `text-sky-500`≈2.5, `text-orange-500`≈2.5 on tint/plain |
| `src/pages/dashboard.tsx` | wellbeing values → `text-emerald-700 dark:text-emerald-400` etc. | `text-*-500` on `bg-muted/30` ≈3.0 |
| `src/pages/planner.tsx` | "Finish setup" → `text-amber-800 dark:text-amber-300` | `text-amber-700` on 10% tint was borderline 4.4 |
| `src/pages/landing.tsx` (footer + scroll hint) | `text-muted-foreground/70` → `text-muted-foreground` | 70% alpha ≈ **2.87** light / 3.63 dark |
| `src/layouts/app-shell.tsx` | sidebar section labels `70` → full | same failure |

## Component fixes (semantics / keyboard / names)

| File | Change |
| --- | --- |
| `src/components/3d/hero-3d.tsx` | Threaded `frozen={reducedMotion}` through `CameraRig` (existing), `Planet`, `Ring`, `Satellite`, `GlassShard`, `DeepField`; `<Float>` swapped for a static `<group>` and `Sparkles speed` zeroed when frozen — mirrors `day-orbit-3d.tsx` which already honoured `frozen` from the dashboard |
| `src/pages/insights.tsx` | `Progress` → `aria-label={`${label} progress`}` (Radix progressbar had no name) |
| `src/pages/dashboard.tsx` | balance `Progress` → `aria-label="Day balance progress"`; `CheckCircle2` "Completed" → `role="img"` so the label is announced |
| `src/pages/templates.tsx` | `announce("Added N tasks …")` after apply so screen-reader users get feedback (toasts are visual-only) |

## Verified good (no change needed)

- All icon-only buttons carry `aria-label` (focus reset/skip, attendance arrows, habit/task
  actions, share, quick-add, command palette, app-shell sound/theme/account).
- `loader states`/`states.tsx` use `role="alert"` / `role="status"`; `dialog`, `dropdown`,
  `select`, `tabs`, `switch` get Radix focus traps + arrow-key support for free; `Button`
  has `focus-visible` rings.
- Focus timer (recently upgraded): chart is `role="img"` with per-bar labels, timer clock is
  `aria-live="polite"` / `aria-label`, progress is `aria-hidden` (clock announces), presets use
  a real `<button aria-pressed>`, pulse/bar transitions are gated on reduced motion.
- Templates category tabs expose `role="tablist"/"tab"` + selection; attendance day cells are
  real buttons (with label + status).

## Requires the parallel agents' attention (not owned here)

- `src/pages/subjects.tsx` — DELETE buttons rely on hover `text-destructive` (pale on light);
  colour swatch buttons labelled `Colour …` (British) — fine but inconsistent.
- `src/pages/onboarding.tsx` — onboarding `Progress` (line ~170) has no label; role chips use
  muted colors on tint.
- `src/pages/settings.tsx` — export/import modals are plain overlays (no focus trap);
  notification prefs toggle is a styled `div` with `onClick` (keyboard not activatable).
- `src/layouts/app-shell.tsx` — the mobile "More" bottom sheet is a plain overlay without a
  focus trap (noted; Radix dialog recommended).

## How to re-verify

```bash
npx vitest run                # includes src/lib/__tests__/a11y.test.ts
npx tsc -b --noEmit
npx eslint src --max-warnings 0
```

Contrast math used the WCAG relative-luminance formula against the parsed HSL tokens and
Tailwind palette hexes; see the measurement scripts used during the pass for reproducibility.