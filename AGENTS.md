<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — Engineering Rules for Drimin Design

These are the rules for **every** change in this repository, whether written by a person or an AI agent. They exist to keep the codebase scalable, the site fast (**Lighthouse 95–100**), the SEO correct, and the animations smooth on phones and large screens alike.

- **What** we are building → [PRD.md](PRD.md)
- **How it looks** (tokens, components, motion) → [DESIGN.md](DESIGN.md)
- **How we build it** → this file

If a rule here conflicts with a request, raise it instead of silently breaking the rule. If a rule is wrong, change this file in the same PR and say why.

---

## 1. Stack & versions

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.4** App Router | `cacheComponents: true`, `partialPrefetching: true` (see `next.config.ts`) |
| UI | **React 19.3** | `<Activity>` preserves routes; `<ViewTransition>` available |
| Language | **TypeScript** strict | No `any`, no non-null `!` without a comment explaining why |
| Styling | **Tailwind CSS v4** | Tokens as CSS variables in `src/styles/tokens.css`, mapped via `@theme` |
| DOM animation | **GSAP** + ScrollTrigger + SplitText (`@gsap/react` → `useGSAP`) | Add when M1 starts |
| Smooth scroll | **Lenis** | Driven by `gsap.ticker`, synced with ScrollTrigger |
| 3D | **three** + **@react-three/fiber** + **@react-three/drei** | Cylinder, reflective floor, tissue-pull shader |
| Physics | **matter-js** | Falling words only; dynamically imported on first interaction |
| Validation | **zod** | Shared by forms (client) and Server Actions (server) |
| Lint/format | ESLint (`eslint-config-next`) + Prettier | |
| Tests | Vitest (units), Playwright (smoke + visual), Lighthouse CI | |

Before adding **any** dependency: check its gzipped size (bundlephobia / `npx next analyze`), check it is tree-shakeable, and justify it in the PR. Prefer platform APIs.

### Commands

```bash
npm run dev          # local dev (Turbopack)
npm run build        # production build — must pass with zero type/lint errors
npm run start        # serve the production build (use this for Lighthouse, never dev)
npm run lint
npx next analyze     # Turbopack bundle analyzer
npm run preview      # OpenNext build, served in the local Cloudflare Workers runtime (:8787)
npm run deploy       # OpenNext build + deploy to Cloudflare Workers (see docs/deploy-cloudflare.md)
```

Hosting is **Cloudflare Workers via `@opennextjs/cloudflare`** (`wrangler.jsonc`, `open-next.config.ts`). Anything that only works on Node servers (filesystem writes, long-lived in-memory state, Node middleware) won't work there: keep state in a repository backed by a real store.

---

## 2. Project structure

Organise by **feature**, not by file type. A feature owns its components, hooks, shaders, data and tests. Shared code moves to `components/` or `lib/` only when a second feature needs it.

```
src/
├─ app/                              # Routing ONLY: layouts, pages, metadata, route handlers
│  ├─ layout.tsx                     # <html>, fonts, global providers, <SiteChrome/>, metadataBase
│  ├─ page.tsx                       # Home: composes section features, no logic
│  ├─ projects/
│  │  ├─ page.tsx
│  │  └─ [slug]/
│  │     ├─ page.tsx                 # generateStaticParams + generateMetadata
│  │     └─ opengraph-image.tsx
│  ├─ contact/page.tsx
│  ├─ appointment/page.tsx
│  ├─ sitemap.ts
│  ├─ robots.ts
│  ├─ manifest.ts
│  ├─ opengraph-image.tsx
│  ├─ not-found.tsx
│  └─ global-error.tsx
│
├─ features/                         # One folder per product feature / section
│  ├─ intro-reveal/                  # Page scale-up intro
│  ├─ hero/                          # Wordmark, falling-words, stats, CTA
│  ├─ project-cylinder/              # R3F scene, roll-in, scroll rotation, room lift
│  ├─ tissue-transition/             # Pinch/peel shader + transition controller
│  ├─ story-tree/                    # Roots → tree SVG, generated data
│  ├─ about-team/
│  ├─ inquiry/                       # Creative form + server action
│  └─ appointment/                   # Booking flow + server action
│     ├─ components/
│     ├─ hooks/
│     ├─ actions.ts                  # 'use server'
│     ├─ schema.ts                   # zod
│     └─ index.ts                    # Public API of the feature (the ONLY import path from outside)
│
├─ components/
│  ├─ ui/                            # Design-system primitives: Button, GlassNav, Input, Container…
│  └─ layout/                        # SiteHeader, SiteFooter, Section
│
├─ lib/
│  ├─ motion/                        # gsap setup, Lenis provider, ticker, easings from tokens, reduced-motion
│  ├─ three/                         # Shared R3F helpers, quality tiers, disposal utils
│  ├─ device/                        # useDeviceTier, usePointerType, useInView
│  ├─ seo/                           # JSON-LD builders, metadata helpers
│  └─ utils/                         # cn(), clamp, lerp, etc. (pure, tested)
│
├─ content/                          # Typed site content (projects, team, milestones, copy)
│  ├─ projects.ts
│  ├─ team.ts
│  └─ milestones.ts
│
├─ server/                           # Server-only code (import 'server-only' at the top)
│  ├─ db/                            # DB client (provider TBD)
│  ├─ repositories/                  # Interfaces + implementations (AppointmentRepository…)
│  └─ email/
│
├─ styles/
│  ├─ tokens.css                     # Design tokens (source of truth = DESIGN.md)
│  └─ globals.css
│
└─ env.ts                            # zod-validated environment variables

scripts/                             # Build-time tools (e.g. generate-tree.ts)
public/                              # Static assets (fonts go through next/font, not here)
```

**Import rules**
- Use the `@/` alias. No deep relative paths (`../../../`).
- Import a feature only through its `index.ts`. Features must not import each other's internals.
- **No barrel files** in `components/ui` or `lib` that re-export everything; they defeat tree-shaking. A feature's `index.ts` exports only what other code needs.
- `app/` files stay thin: compose features, declare metadata, fetch data. No animation code in `app/`.

**Naming**
- Files and folders: `kebab-case`. React components: `PascalCase` exports. Hooks: `useThing`. Server Actions: verbs (`submitInquiry`).
- One component per file. Co-locate `*.test.ts` next to the code.
- Shaders: `*.vert.glsl` / `*.frag.glsl`, or template strings in `shaders.ts`.

---

## 3. Next.js 16 rules (read the bundled docs first)

The docs for this exact version live in `node_modules/next/dist/docs/`. Read the relevant guide before using an API. Key ones:
`01-app/01-getting-started/08-caching.md`, `02-guides/preserving-ui-state.md`, `02-guides/view-transitions.md`, `02-guides/lazy-loading.md`, `02-guides/json-ld.md`, `02-guides/optimizing-the-static-shell.md`, `02-guides/package-bundling.md`.

### 3.0 CSS conventions
- `src/styles/globals.css` is imported **first** in `app/layout.tsx`: it declares Tailwind's layer order (`theme, base, components, utilities`) before any component CSS loads.
- CSS Modules wrap their rules in `@layer components`, so Tailwind utilities on the same element still win. Unlayered module CSS would silently beat every utility.
- `next.config.ts` runs the Tailwind Turbopack loader on global stylesheets only (`not: *.module.css`); routing modules through it renames them `*.module.css.css`, which drops their scoping and `:global()` rules.
- CSS Modules must be "pure": every selector needs a local class (`:global(html[data-x]) .local` is fine, a selector that is entirely `:global(...)` is not).

### 3.1 Server vs client
- **Server Components by default.** Add `'use client'` only on the smallest leaf that needs state, effects, refs, or browser APIs.
- Never put `'use client'` on a page or layout. Wrap the interactive part instead.
- Pass serialisable props only across the boundary. Content (copy, project data) is read on the server and passed down.
- Server-only modules start with `import 'server-only'`.

### 3.2 Cache Components & rendering
- Cache Components is **on**. Data access is dynamic unless marked with `'use cache'`. All marketing content (projects, team, milestones) is static: read it inside `'use cache'` functions with an appropriate `cacheLife`, so every marketing route prerenders to a **static shell**.
- Only the appointment availability is dynamic; wrap that part in `<Suspense>` so the rest of the page stays in the static shell.
- `/projects/[slug]` uses `generateStaticParams` for every project.
- Do not export `runtime` from any route (unsupported with Cache Components).

### 3.3 Navigation & preserved state (critical for the cylinder)
- With Cache Components, Next.js keeps up to 3 visited routes alive inside React `<Activity>` (hidden with `display: none`) instead of unmounting them. Going Home → Project → back restores Home **with its DOM and state intact**. The tissue-close animation depends on this.
- Consequences every animated component must handle:
  - When hidden, **pause** render loops, Lenis, ScrollTriggers and timers (use a `useLayoutEffect` cleanup and/or a visibility hook in `lib/motion`). A hidden WebGL canvas must not keep rendering.
  - When shown again, **resume** and call `ScrollTrigger.refresh()` once, after layout settles.
  - Transient UI (open menus, hover states) resets in a `useLayoutEffect` cleanup, per `preserving-ui-state.md`.
- Use `<Link>` for all internal navigation (prefetch). Use `router.push` only inside transition controllers.

### 3.4 Route transitions
- The tissue-pull transition is orchestrated by a **TransitionLayer** mounted once in the root layout (a fixed, pointer-events-none canvas above the page):
  1. On panel click, the cylinder reports the panel's screen-space quad + texture to the transition controller (a small store, e.g. `zustand` or React context with refs; no re-renders per frame).
  2. TransitionLayer plays the pinch/peel and calls `router.push('/projects/[slug]')` at the mid-point (route already prefetched).
  3. The project page renders its hero image in the exact final rect; TransitionLayer fades out and releases its resources.
  4. Close (button or browser back) runs the reverse with the stored origin quad.
- Direct visits to `/projects/[slug]` never depend on the transition.
- Simple page-to-page transitions (e.g. Projects grid → detail) use React `<ViewTransition>`. Do not hand-roll them.

---

## 4. Animation architecture

### 4.1 Principles
1. **Every animation has a physical idea** (weight, gravity, cloth, growth, spring). If you can't name it, don't ship it.
2. **Animate only compositor-friendly properties:** `transform`, `opacity`, `clip-path`, and (rarely, never on large areas on mobile) `filter`. Never animate `width/height/top/left/margin` or anything that triggers layout.
3. **One clock.** Lenis and GSAP run on `gsap.ticker`. R3F uses `frameloop="demand"` and is invalidated while something moves, or `"always"` only while its section is in view. No stray `requestAnimationFrame` loops.
4. **No React state in hot paths.** Per-frame values live in refs, GSAP tweens, uniforms, or CSS variables. Never call `setState` inside `useFrame`, scroll handlers or ticker callbacks.
5. **Everything cleans up.** Use `useGSAP` with a `scope` (auto-reverts tweens and ScrollTriggers). Dispose three.js geometries, materials, textures and render targets on unmount. Remove listeners.
6. **Motion values come from tokens** (`lib/motion/tokens.ts`, mirroring DESIGN.md §7). No magic durations or easings inline.

### 4.2 Reduced motion & capability contract
- Every animated component implements **three modes**: `full`, `reduced` (opacity/short fades only), and `static` (no JS animation; final state rendered by HTML/CSS).
- `prefers-reduced-motion: reduce` → `reduced`. No WebGL / low tier / `saveData` → the feature's documented fallback.
- Use `gsap.matchMedia()` for motion and breakpoint variants so they revert cleanly.
- Content must be fully readable and usable with JavaScript disabled (SSR HTML is the base layer; animation is progressive enhancement).

### 4.3 Device quality tiers
`lib/device/useDeviceTier()` returns `'high' | 'medium' | 'low'` from: WebGL2 support, GPU renderer string, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `devicePixelRatio`, viewport size, `connection.saveData`, and a short runtime FPS probe (downgrade if sustained < 45 fps).

| Setting | high | medium | low |
|---|---|---|---|
| Canvas DPR cap | 2 | 1.5 | 1 |
| Cylinder radial segments | 128 | 64 | 32 |
| Floor reflection | Real-time reflector, 1024 px, blur | Reflector 512 px, no blur | Static baked gradient + mirrored sprite |
| Tissue grid | 96×96 | 64×64 | 32×32 (or 2D fallback) |
| Project textures | 2048 px AVIF/KTX2 | 1024 px | 768 px |
| Tree leaves | SVG, full count | SVG, 60 % count | Canvas-rendered or reduced count |
| Post-processing | Allowed if budgeted | None | None |

### 4.4 Feature-specific rules
- **Intro reveal** (`features/intro-reveal`): pure CSS on the compositor, no animation JS. An inline pre-paint script (`intro-script.ts`, serialised from TS constants) decides whether to play (home, first visit per session, motion allowed, or `?intro`), writes the frame geometry as CSS variables and sets `html[data-intro]` to `play`, then `done` when finished so `<Activity>` restores don't replay it. Only `transform`/`scale`/`opacity` animate, and **never two animations on the same property of one element** (Chrome composites only one; that's why the pop uses `scale` and the expand `transform`). Elements that fade start at `opacity: 0.01`, not 0, so Chrome counts them as painted for LCP.
- **Wordmark letters:** split **on the server** (spans in the SSR HTML) so the intro can animate them before hydration; the `<h1>` carries an `sr-only` full name and the letter spans are `aria-hidden`. The bend (`BendableLetters` + `useWordmarkBend`) writes only `--bend` and the independent `scale` property per letter, so it composes with the intro's `transform`; its strips draw the glyph with CSS `content: var(--char)` so the word is never duplicated in DOM text, and they only render after the intro on motion-allowed devices. Respect `pointer: coarse` (tap/drag variant).
- **Liquid glass:** use the `liquid-glass` utility; never hand-roll glass. Refraction and pointer light come from `LiquidGlassEnhancer` (mounted once in the root layout). Don't put glass inside an ancestor with animated `opacity` (it becomes the backdrop root and the glass loses the page behind it); put intro classes on the glass element itself.
- **Falling words:** render the sentence as HTML. On the first interaction, `await import('matter-js')`, measure the word rects, and hand bodies to the engine; render bodies by writing `transform` to the word spans (no canvas). Stop the engine when all bodies sleep.
- **Ring (project cylinder):** one `<Canvas>` (`frameloop="demand"`), mounted only when the section is within ~1 viewport (`IntersectionObserver` + `next/dynamic` with `ssr: false`). Scroll is mapped to targets in a mutable store (`store.ts`, never React state per frame); camera and ring follow through critically damped springs and invalidate only while moving. Scroll smoothing and snapping come from the site-wide Lenis instance (`lib/motion/smooth-scroll.ts`, `components/layout/smooth-scroll.tsx`; loaded after the intro); never use CSS scroll-snap alongside it. Mark scrollable overlays with `data-lenis-prevent`. Grounding is physical (light spill + reflection), never a painted shadow decal. Project names also exist as real text (SEO + screen readers).
- **Tissue transition:** custom `ShaderMaterial` on a subdivided plane. Uniforms: `uPinch` (vec2, UV of pinch point), `uProgress`, `uTime`, `uWrinkle`, `uTexture`. Deformation in the vertex shader; spring-damped progress on the CPU. All tunables exposed as constants for design review.
- **Story tree:** geometry is generated **at build time** by `scripts/generate-tree.ts` (seeded space-colonisation → tapered branch outlines → SVG path data) into `src/features/story-tree/data/tree.generated.ts`. Never generate at runtime. At runtime each branch only maps scroll progress to its own growth progress. Budget ≤ 1500 animated nodes.

---

## 5. Performance rules (target: Lighthouse 95–100)

### 5.1 Budgets (enforced in CI)

| Budget | Limit |
|---|---|
| Initial JS on `/` (gzip, excl. lazy chunks) | ≤ 130 KB |
| Initial JS on other routes | ≤ 100 KB |
| Lazy 3D chunk (three + R3F + scene) | ≤ 220 KB gzip, loaded after LCP only |
| CSS (gzip) | ≤ 25 KB |
| Fonts above the fold | ≤ 4 files, ≤ 70 KB total (WOFF2, subset; currently 4 files ≈ 54 KB) |
| LCP | < 2.0 s mobile (simulated slow 4G) |
| TBT | < 150 ms mobile |
| CLS | < 0.05 |
| INP | < 150 ms |

### 5.2 Loading strategy
1. **First paint = server HTML + CSS.** Hero text, nav and layout render without JavaScript.
2. **Hydrate small.** Only the hero's interactive leaves hydrate immediately.
3. **Defer the heavy stuff.** three.js, physics, tree data and GSAP plugins not needed for the hero load via dynamic `import()` when their section approaches the viewport or on first interaction, and never before the `load` event + idle (`requestIdleCallback` with timeout).
   Fetch a section's code early with `warmUp()` (`lib/motion/warm-up.ts`: after the intro, when idle) and wrap lazy imports in `retryImport()` (`lib/utils/retry-import.ts`); mounting stays tied to proximity.
4. **Prefetch intelligently.** Project routes are prefetched when the cylinder section mounts (static shells only, per `partialPrefetching`).

### 5.3 Assets
- **Images:** always `next/image` with explicit `sizes`. Use `preload` (not the deprecated `priority`) or `fetchPriority="high"` **only** for the single LCP image, if any. AVIF/WebP. No image larger than its largest rendered size × DPR cap.
- **WebGL textures:** pre-sized per tier; prefer KTX2 (Basis) for many textures; load lazily and dispose on unmount.
- **Fonts:** `next/font/local` with WOFF2, `display: 'swap'`, subset to Latin, preload only the weights used above the fold, `adjustFontFallback` on to prevent CLS. Fonts live in `src/app/fonts/`.
- **SVG:** optimised with SVGO; inline only small icons; large illustrations as static data or files.
- **Video (if any):** `preload="none"`, poster image, muted, `playsInline`, only when in view.

### 5.4 Runtime
- Avoid long tasks > 50 ms: chunk heavy setup (texture uploads, physics body creation) across frames.
- Use passive listeners; never read layout (`getBoundingClientRect`) and write styles in the same frame without batching. Cache measurements; re-measure on `ResizeObserver`, not on scroll.
- Full-height sections use `svh`/`dvh` (never bare `100vh`) so mobile URL bars don't cause jumps.
- `will-change` only during an animation, removed afterwards.
- Pause everything off-screen (IntersectionObserver) and when the tab is hidden (`visibilitychange`).

### 5.5 Third parties
- No third-party scripts in `<head>`. Analytics via `next/script` with `strategy="lazyOnload"` or a server-side/edge solution. Each third party needs a written performance justification.

---

## 6. SEO rules

- **Root layout** sets `metadataBase`, a `title.template` (`%s — Drimin Design`), default description, `openGraph`, `twitter`, `icons`, `alternates.canonical`.
- **Every route** exports `metadata` or `generateMetadata` with a unique title, description (140–160 chars) and canonical URL.
- **OG images:** `opengraph-image.tsx` at root and per project (generated with the brand colour and display font).
- **`sitemap.ts`** lists all static routes + every project; **`robots.ts`** allows all and points to the sitemap. **`manifest.ts`** for PWA basics and theme colour `#FA2E00`.
- **Structured data (JSON-LD)** per `02-guides/json-ld.md`: `Organization` + `WebSite` in the root layout; `CreativeWork` + `BreadcrumbList` on project pages; `ContactPage` on contact. Build them in `lib/seo/` with typed helpers; escape `<` in serialised JSON.
- **Semantic HTML:** exactly one `<h1>` per page, logical heading order, `<main>`, `<nav>`, `<section aria-labelledby>`, `<footer>`. Lists are `<ul>/<ol>`.
- **Content never lives only in canvas/SVG.** Project titles, story milestones and all copy exist as real text in the DOM.
- Descriptive `alt` on all meaningful images; `alt=""` on decorative ones.
- Internal links via `<Link>` with descriptive text (no "click here").
- `lang="en"` on `<html>`; consistent trailing-slash policy (none).

---

## 7. Responsive & cross-device rules

- **Mobile-first CSS.** Base styles target 360 px; enhance upward with the breakpoints in DESIGN.md §5.
- **Fluid by default:** type and spacing use the `clamp()` tokens; avoid fixed pixel sizes for layout.
- **Test widths for every UI change:** 360, 390, 768, 1024, 1440, 1920, 2560.
- **Input parity:** every hover interaction has a touch equivalent (`@media (hover: hover) and (pointer: fine)` gates hover-only effects). Touch targets ≥ 44×44 px.
- **Same experience, scaled quality:** never remove a signature moment on mobile. Lower its cost via device tiers (§4.3).
- Large screens (≥ 1920 px): cap content width with the container token; scale display type and 3D framing so the composition doesn't look empty.
- Safe areas: respect `env(safe-area-inset-*)` for fixed UI (navbar, CTA).

---

## 8. Accessibility rules (WCAG 2.2 AA)

- Colour pairs only from DESIGN.md §2.4. **White body text on orange is forbidden.**
- Visible focus on every interactive element (focus token in DESIGN.md). Never `outline: none` without a replacement.
- All interactive things are real `<button>` / `<a>` / form controls. No click handlers on `div`s.
- Canvas scenes have an accessible HTML equivalent (e.g. the project link list) and `aria-hidden="true"` on the canvas itself.
- Scroll-jacked/pinned sections must not trap keyboard users; Tab order follows visual order.
- Form fields have labels (visually hidden allowed in the sentence-form), errors are announced (`aria-live="polite"`) and linked via `aria-describedby`.
- Respect `prefers-reduced-motion` (§4.2) and `prefers-contrast`.

---

## 9. Data, forms & backend

- **Content:** typed objects in `src/content/*.ts` validated with zod at build time. Components never hard-code copy that belongs to content.
- **Repository pattern:** UI and Server Actions depend on interfaces (`AppointmentRepository`, `InquiryRepository`) in `src/server/repositories/`. The concrete DB implementation is swapped in one place. Until the provider is chosen, an in-memory implementation is used in development.
- **Server Actions** (`features/*/actions.ts`): validate input with the feature's zod schema, check a honeypot field, rate-limit, call the repository, return a typed result `{ ok: true } | { ok: false, errors }`. Never trust client data. Never return raw errors to the client.
- **Appointments:** slot reservation must be atomic (unique constraint / transaction) to prevent double booking. Store times in UTC; display in the studio's time zone.
- **Environment variables:** declared and validated in `src/env.ts`. Secrets never get the `NEXT_PUBLIC_` prefix. `.env*` files are never committed.

---

## 10. Code quality

- TypeScript `strict`; no `any` (use `unknown` + narrowing); exported functions have explicit return types.
- Components: props typed with an interface or type alias; keep components < ~200 lines. Extract hooks for logic.
- Prefer pure functions in `lib/utils` with unit tests (math helpers for physics, easing, geometry).
- Comments explain **why**, not what. Every shader uniform and every magic physical constant gets a one-line comment.
- No dead code, no commented-out code, no `console.log` in commits (`console.error` in error boundaries is fine).
- Errors: route-level `error.tsx` where a segment can fail; `global-error.tsx` at the root. WebGL init failure falls back silently to the static variant.

---

## 11. Quality gates & definition of done

A change is done when:

- [ ] `npm run build` passes with zero TypeScript and ESLint errors.
- [ ] Works at all test widths (§7) and with touch and mouse.
- [ ] `prefers-reduced-motion` variant verified.
- [ ] No console errors or warnings in the browser.
- [ ] Lighthouse (production build, mobile preset) on affected routes: Performance ≥ 95, A11y/BP/SEO = 100.
- [ ] Bundle budgets (§5.1) respected (`npx next analyze` when deps change).
- [ ] Animations hold 60 fps in the Performance panel with 4× CPU throttling on the medium tier.
- [ ] Hidden-route behaviour checked: navigate away and back, and nothing keeps running or breaks (§3.3).
- [ ] New tokens/components documented in DESIGN.md.

### Git
- Branch per feature: `feat/hero-falling-words`, `fix/cylinder-resize`.
- Conventional commits: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`.
- Small PRs with a short description, screenshots or a screen recording for any visual change, and Lighthouse numbers for performance-sensitive changes.
