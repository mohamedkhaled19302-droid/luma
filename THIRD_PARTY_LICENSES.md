# Third-Party Software Notices

LUMA is buildable thanks to the following open-source packages. Each project is
distributed under its own license; the text below lists every production and
development dependency declared in `package.json`, its license type, and its
copyright holder (where declared in the package metadata).

All packages are used in unmodified form except where noted. Licenses are
reproduced in full under `node_modules/<package>/LICENSE` at build time.

## Production dependencies

| Package | License | Copyright / Holder |
| --- | --- | --- |
| @hookform/resolvers | MIT | bluebill1049 & react-hook-form contributors |
| @radix-ui/react-alert-dialog | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-avatar | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-checkbox | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-dialog | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-dropdown-menu | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-label | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-popover | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-progress | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-radio-group | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-scroll-area | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-select | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-separator | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-slot | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-switch | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-tabs | MIT | WorkOS, Inc. (Radix UI) |
| @radix-ui/react-tooltip | MIT | WorkOS, Inc. (Radix UI) |
| @react-three/drei | MIT | Paul Henschel & pmndrs contributors |
| @react-three/fiber | MIT | Paul Henschel & pmndrs contributors |
| @supabase/supabase-js | MIT | Supabase, Inc. |
| @tanstack/react-query | MIT | Tanner Linsley & TanStack contributors |
| class-variance-authority | Apache-2.0 | Joe Bell & contributors |
| clsx | MIT | Luke Edwards |
| date-fns | MIT | date-fns contributors |
| lucide-react | ISC | Lucide contributors |
| react | MIT | Meta Platforms, Inc. |
| react-dom | MIT | Meta Platforms, Inc. |
| react-hook-form | MIT | Beaufort include / react-hook-form contributors |
| react-router-dom | MIT | Remix Software / Shopify |
| sonner | MIT | Emil Kowalski |
| tailwind-merge | MIT | iddan (Dany) |
| three | MIT | three.js authors |
| zod | MIT | Colin McDonnell |

## Development dependencies

| Package | License | Copyright / Holder |
| --- | --- | --- |
| @types/node | MIT | DefinitelyTyped contributors |
| @types/react | MIT | DefinitelyTyped contributors |
| @types/react-dom | MIT | DefinitelyTyped contributors |
| @types/three | MIT | three.js type definitions contributors |
| @typescript-eslint/eslint-plugin | MIT | typescript-eslint contributors |
| @typescript-eslint/parser | MIT | typescript-eslint contributors |
| @vitejs/plugin-react | MIT | Vite team |
| autoprefixer | MIT | Andrey Sitnik, postcss authors |
| eslint | MIT | OpenJS Foundation |
| eslint-plugin-react-hooks | MIT | Meta Platforms, Inc. |
| eslint-plugin-react-refresh | MIT | Arnaud Barré |
| playwright | Apache-2.0 | Microsoft Corporation |
| postcss | MIT | Andrey Sitnik |
| tailwindcss | MIT | Tailwind Labs, Inc. |
| tailwindcss-animate | MIT | Jamie Kyle |
| tsx | MIT | esbuild-kit contributors |
| typescript | Apache-2.0 | Microsoft Corporation |
| vite | MIT | Void Zero / Vite contributors |
| vite-plugin-pwa | MIT | Anthony Fu & Vite PWA contributors |
| vite-tsconfig-paths | MIT | alemagio |
| vitest | MIT | Vitest contributors |

## Fonts

LUMA loads its display and body typefaces via Google Fonts' CDN at runtime:

| Font | License | Copyright / Holder |
| --- | --- | --- |
| Inter (400–800) | SIL Open Font License 1.1 | Rasmus Andersson & The Inter Project Authors |
| Space Grotesk (500–700) | SIL Open Font License 1.1 | Florian Karsten & The Space Grotesk Project Authors |

Both fonts are licensed under the SIL Open Font License 1.1. The full license
texts are available at <https://openfontlicense.org/> and alongside the font
files served by Google Fonts.

## Licenses summary

- **MIT** — permission is hereby granted, free of charge, to any person
  obtaining a copy of this software to deal in the software without
  restriction, including commercial use, provided the copyright notice and
  this permission notice are included in all copies or substantial portions.
  <https://opensource.org/license/mit/>
- **Apache-2.0** — a permissive license granting broad rights to use, modify
  and redistribute, with an explicit patent grant, provided an attribution
  notice is retained and a copy of the Apache 2.0 License is included with
  distributed code. <https://www.apache.org/licenses/LICENSE-2.0>
- **ISC** — functionally equivalent to the MIT license (permissive, with a
  notice-preservation requirement). <https://opensource.org/license/isc/>
- **SIL OFL 1.1** — fonts may be used, modified, embedded and redistributed
  freely as long as they are not sold by themselves and modified versions are
  distributed under the same license. <https://openfontlicense.org/>

Unless otherwise noted, LUMA's own source code is governed by the LICENSE file
in the repository root. This file does not alter or supersede the licenses of
any third-party components listed above.