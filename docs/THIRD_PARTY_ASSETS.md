# Third-party assets and services

Every external dependency that ships bytes to the browser, or that the app calls
over the network at runtime. Anything not listed here is first-party work or a
build-time npm dependency covered by the lockfile.

The rule this file exists to enforce: **if it is not in this file, it is not
allowed to reach the user's browser or the user's data.**

---

## 1. Fonts

No font binaries are vendored, self-hosted, or fetched from a CDN.

`tailwind.config.js` names `Inter` and `Space Grotesk` in `fontFamily.sans` and
`fontFamily.display`, and `src/styles.css` contains no `@font-face` or `@import`
rule. The stacks therefore resolve against fonts already installed on the
device and fall through to `system-ui` / `sans-serif`.

| Family | Role | Delivery | License |
| --- | --- | --- | --- |
| Inter | UI body text | Not shipped; system lookup only | SIL Open Font License 1.1 |
| Space Grotesk | Headings / display | Not shipped; system lookup only | SIL Open Font License 1.1 |

Consequences to keep in mind:

- there is no font CDN request, so no third party learns a page view;
- there is no `font-display` performance cost, but also no guarantee the intended
  typeface renders;
- if these are ever self-hosted, the OFL requires shipping the licence text with
  the files, and the SIL OFL's reserved-font-name rule means the family cannot be
  redistributed under a modified name. Update this section when that happens.

## 2. Icons

| Package | License | Notes |
| --- | --- | --- |
| `lucide-react` | ISC | Tree-shaken, bundled at build time. No runtime request. |

## 3. First-party icons and images

All generated for this project and covered by the repository licence.

| File | Purpose |
| --- | --- |
| `public/favicon.svg` | Browser tab mark |
| `public/pwa-192x192.png` | PWA install icon |
| `public/pwa-512x512.png` | PWA install icon |
| `public/pwa-maskable-512x512.png` | PWA maskable icon |

No stock photography, no icon packs, and no third-party illustrations are
bundled. The empty states and onboarding illustrations are drawn in SVG in the
component source.

## 4. Network services

Services the app calls at runtime, and exactly what leaves the browser.

### Supabase

- **Authentication only** (email and password). Supabase provides identity; it
  does not store any planner data.
- **Sent:** the email address and password hash during sign-in, and the access
  token on every authenticated request (including to the server-side AI proxy,
  which validates it before spending any OpenRouter quota).
- **Not sent:** tasks, habits, goals, schedule blocks, categories, settings,
  wellbeing check-ins, notifications, or templates. Those live in the browser's
  IndexedDB and are never transmitted.
- **Not sent:** the OpenRouter key, or conversation content the person has not
  chosen to share.
- The server-side AI proxy holds no database access of its own, and the client
  writes go straight to local storage rather than through row-level security.

### OpenRouter

- Reached **only** from the server, through `/api/ai/chat` and `/api/ai/vision`.
  The browser never calls it directly and the API key is never in client code.
- **Sent for a chat turn:** the conversation, and a planning snapshot containing
  task titles, habit names, goal titles, category names, and today's block
  titles and times. Deliberately **not** sent: email, account ids, password
  material, or raw timestamps (a local weekday and `HH:mm` are sent instead, so
  the request does not leak a timezone).
- **Sent for a screen question:** one explicitly captured, downscaled JPEG, the
  person's question, and nothing else. Capture only ever starts from a deliberate
  tap, takes a single frame, and releases the track immediately — there is no
  periodic or background capture anywhere in the app.
- Only models the live catalogue reports as zero-cost are ever selected. If no
  free model is available the request fails; it never silently falls back to a
  paid one.

### Browser speech APIs (Web Speech)

- `SpeechRecognition` and `speechSynthesis` are browser built-ins. They are not a
  third-party SDK, but **their audio handling depends on the browser vendor**,
  and Chromium builds may send microphone audio to the vendor's own service.
- Morrow only starts recognition after a deliberate action, and the wake-phrase
  match itself happens in the page. This is a documented limitation, not a
  guarantee of on-device audio.

## 5. Build-time only

`@supabase/supabase-js`, `zod`, `date-fns`, `react`, `react-router-dom`,
`@tanstack/react-query`, `sonner`, and the rest of the npm dependency tree.
Bundled locally at build time; no runtime network access, licences recorded in
the lockfile and the respective packages.

### Bundled runtime libraries that store data locally

These ship in the JavaScript bundle and read/write only browser storage. They
make no network requests.

| Package | License | Role |
| --- | --- | --- |
| `dexie` | Apache-2.0 | IndexedDB access for planner data, which lives only on the device. |
| `fake-indexeddb` | Apache-2.0 | Test-only IndexedDB implementation used by `src/data/__tests__`. Not part of a production build. |
