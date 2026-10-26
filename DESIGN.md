# DESIGN.md — Drimin Design System

| | |
|---|---|
| **Status** | Draft v0.1. Brand colour locked; fonts pending |
| **Last updated** | 2026-10-25 |
| **Source of truth for** | Colour, type, spacing, layout, elevation, components, motion, 3D/illustration art direction |
| **Implemented in** | `src/styles/tokens.css` (CSS variables) → Tailwind v4 `@theme` · `src/lib/motion/tokens.ts` (motion constants) |

Rules for using this system in code are in [AGENTS.md](AGENTS.md). Product behaviour is in [PRD.md](PRD.md).

---

## 1. Design principles

1. **Physical, not decorative.** Every motion has weight: gravity, spring, cloth, growth. Nothing floats in from nowhere.
2. **Loud type, quiet UI.** The display type is huge and bold; everything around it (nav, labels, buttons) is small, precise, and calm.
3. **Three surfaces, one story.** Orange (energy) → Dark (focus on work) → White (growth, story). Each surface has its own token set, so every component works on all three.
4. **Tactile depth, no drop shadows.** Depth comes from inner shadows, gradients, glass and light, as if the UI were pressed into the surface rather than hovering over it.
5. **Same experience on every screen.** Fluid tokens scale the composition; quality tiers scale the cost.

---

## 2. Colour

### 2.1 Brand: Orange

`#FA2E00` is the brand colour (`orange-500`). The scale is derived around it for states, gradients and illustration.

**All screen sizes:** use the same `#FA2E00` brand orange and desktop room palette, including on phones. The ring's CSS loading background and WebGL backdrop/fog/floor share the `--stage-*` tokens in `tokens.css`, so resizing and rotation do not change the colours. The browser theme colour also stays `#FA2E00`. Print artwork (ID cards, strap) uses the same brand orange.

| Token | Hex | Use |
|---|---|---|
| `orange-50` | `#FFF2EE` | Tints on white surfaces |
| `orange-100` | `#FFE0D6` | Selection background on white |
| `orange-200` | `#FFBFAA` | Illustration highlights |
| `orange-300` | `#FF9473` | Blossoms (tree), soft accents |
| `orange-400` | `#FF6038` | Button gradient top, hover glow |
| **`orange-500`** | **`#FA2E00`** | **Brand. Hero surface, primary buttons, accents** |
| `orange-600` | `#D62700` | Orange **text/links on white** (5.1:1), button gradient bottom |
| `orange-700` | `#AD1F00` | Pressed states, deep gradient end |
| `orange-800` | `#851800` | Illustration shadow |
| `orange-900` | `#5C1100` | Illustration deep shadow |
| `orange-950` | `#330900` | Rare: deepest accents |

### 2.2 Neutrals: Ink

| Token | Hex | Use |
|---|---|---|
| `ink-950` | `#0A0A0A` | **Dark section surface**, text on orange and white |
| `ink-900` | `#121212` | Raised surface on dark |
| `ink-800` | `#1C1C1C` | Cards on dark |
| `ink-700` | `#2A2A2A` | Borders on dark |
| `ink-600` | `#3D3D3D` | Disabled text on dark |
| `ink-500` | `#6B6B6B` | Muted text **on white** (5.3:1) |
| `ink-400` | `#8F8F8F` | Muted text **on dark** (6.1:1) |
| `ink-300` | `#BDBDBD` | Dividers on white |
| `ink-200` | `#DEDEDE` | Borders on white |
| `ink-100` | `#EFEFEF` | Subtle fills on white |
| `ink-50` | `#F7F7F7` | Alternate white surface |
| `white` | `#FFFFFF` | **Light section surface**, text on dark |

### 2.3 Surfaces (semantic tokens)

Every section declares its surface with `data-surface="orange" | "dark" | "light"`. Components use **only semantic tokens**, never raw palette values, so they automatically adapt.

| Semantic token | `orange` surface | `dark` surface | `light` surface |
|---|---|---|---|
| `--bg` | `orange-500` | `ink-950` | `white` |
| `--bg-raised` | `orange-400` @ 0.35 overlay | `ink-900` | `ink-50` |
| `--fg` (body text) | `ink-950` | `white` | `ink-950` |
| `--fg-display` (≥ 24 px / ≥ 19 px bold) | `white` | `white` | `ink-950` |
| `--fg-muted` | `ink-950` @ 0.72 | `ink-400` | `ink-500` |
| `--accent` | `ink-950` | `orange-500` | `orange-600` |
| `--border` | `ink-950` @ 0.16 | `ink-700` | `ink-200` |
| `--focus-ring` | `ink-950` | `orange-400` | `orange-600` |
| `--selection-bg` | `ink-950` | `orange-500` | `orange-100` |

**Home page surface map:** Hero = `orange` · Ring = `orange` (lit studio cove) · Roots → Tree = `light` · About/Team = `light` · Inquiry = `orange` · Footer = `dark`.

### 2.4 Contrast rules (WCAG 2.2 AA)

| Pair | Ratio | Allowed for |
|---|---|---|
| `ink-950` on `orange-500` | **5.1:1** | All text ✅ |
| `white` on `orange-500` | **3.9:1** | Display/large text (≥ 24 px, or ≥ 19 px bold) and icons only ⚠️ **Never body text** |
| `orange-500` on `ink-950` | **5.1:1** | All text ✅ |
| `white` on `ink-950` | 19.8:1 | All text ✅ |
| `orange-500` on `white` | 3.9:1 | Large text and graphics only ⚠️ |
| `orange-600` on `white` | 5.1:1 | All text, links ✅ |
| `ink-500` on `white` | 5.3:1 | Muted text ✅ |
| `ink-400` on `ink-950` | 6.1:1 | Muted text ✅ |

Rule of thumb: **on orange, small text is ink; big text may be white.**

---

## 3. Typography

| Role | Token | Font | Weights shipped | Fallback stack | Character |
|---|---|---|---|---|---|
| Display | `--font-display` | **Outrun** (Funtype Foundry) | 400 (heavy face; caps-only, lowercase maps to caps) | `"Arial Narrow", Impact, sans-serif` | Ultra-bold, condensed, tight |
| Body / UI / nav | `--font-body` | **Manrope** (SIL OFL 1.1) | 400, 500, 600 | `ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif` | Geometric grotesk, high legibility |

- Sources live in `assets/fonts/`; the served files are Latin-subset WOFF2 in `src/app/fonts/` (Outrun ≈ 4 KB, Manrope ≈ 50 KB for three weights), loaded with `next/font/local` in `src/app/fonts/fonts.ts`. Regenerate with `python -m fontTools.subset <src> --unicodes=<latin> --flavor=woff2`.
- ⚠️ **Outrun licence:** the download is **personal use only** (`assets/fonts/Outrun-LICENSE.txt`). A commercial licence from funtypefonts.com is required before launch.
- Outrun metrics (upm 1000): ascender 750, descender 250, cap height 680. The wordmark uses `line-height: 0.86` so its line box tops out exactly at cap height (see `wordmark.module.css`).

### 3.1 Fluid type scale

Sizes interpolate between 360 px and 1920 px viewports.

| Token | Size (`clamp`) | Line height | Tracking | Font | Use |
|---|---|---|---|---|---|
| `text-wordmark` | `clamp(5.5rem, 22vw, 28rem)` | 0.82 | -0.02em | display | Hero wordmark only |
| `text-display-xl` | `clamp(3.5rem, 10vw, 10rem)` | 0.88 | -0.02em | display | Section titles ("We begin with roots.") |
| `text-display-lg` | `clamp(2.5rem, 6vw, 6rem)` | 0.92 | -0.015em | display | Large statements, project titles |
| `text-heading-xl` | `clamp(2rem, 4vw, 3.75rem)` | 1.0 | -0.01em | display | H2 |
| `text-heading-lg` | `clamp(1.5rem, 2.4vw, 2.25rem)` | 1.1 | -0.005em | body (bold) | H3 |
| `text-heading-md` | `clamp(1.25rem, 1.6vw, 1.5rem)` | 1.2 | 0 | body (semibold) | H4, card titles |
| `text-stat` | `clamp(1.75rem, 3vw, 3rem)` | 1.0 | -0.01em | body/mono (medium) | `8K+` counters |
| `text-body-lg` | `clamp(1.125rem, 1.2vw, 1.25rem)` | 1.5 | 0 | body | Hero description, lead paragraphs |
| `text-body` | `1rem` | 1.6 | 0 | body | Default |
| `text-body-sm` | `0.875rem` | 1.5 | 0 | body | Secondary text |
| `text-label` | `0.75rem` | 1.2 | 0.04em | body/mono (medium) | Nav, tags, stat labels, buttons-sm |

**Rules**
- Max line length for body: `65ch`.
- Display text uses `text-wrap: balance`; body uses `text-wrap: pretty`.
- Never set display text below `text-heading-xl` in the display font (condensed faces get illegible small).
- Numbers in stats use `font-variant-numeric: tabular-nums` so count-ups don't jitter.

---

## 4. Spacing

4 px base unit.

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `space-0` | 0 | | `space-10` | 40 px |
| `space-1` | 4 px | | `space-12` | 48 px |
| `space-2` | 8 px | | `space-16` | 64 px |
| `space-3` | 12 px | | `space-20` | 80 px |
| `space-4` | 16 px | | `space-24` | 96 px |
| `space-5` | 20 px | | `space-32` | 128 px |
| `space-6` | 24 px | | `space-40` | 160 px |
| `space-8` | 32 px | | | |

**Fluid layout spacing**

| Token | Value | Use |
|---|---|---|
| `--gutter` | `clamp(1rem, 3vw, 2.5rem)` | Page side padding (16 px minimum on phones) |
| `--space-section` | `clamp(4rem, 10vw, 10rem)` | Vertical padding between sections |
| `--space-stack` | `clamp(1.5rem, 3vw, 3rem)` | Gap between blocks inside a section |
| `--intro-inset` | `clamp(0.5rem, 1.5vw, 1.5rem)` | White frame width before the intro scale-up |

---

## 5. Layout

### 5.1 Breakpoints (mobile-first, `min-width`)

| Token | Width | Typical device |
|---|---|---|
| base | 0 | Phones (design at 360 / 390) |
| `sm` | 640 px | Large phones landscape |
| `md` | 768 px | Tablets portrait |
| `lg` | 1024 px | Tablets landscape, small laptops |
| `xl` | 1280 px | Laptops |
| `2xl` | 1536 px | Desktops |
| `3xl` | 1920 px | Full HD+ |
| `4xl` | 2560 px | QHD / ultrawide |

### 5.2 Grid

| Range | Columns | Gap |
|---|---|---|
| < 768 px | 4 | 16 px |
| 768–1023 px | 8 | 20 px |
| ≥ 1024 px | 12 | 24 px (32 px ≥ 1920) |

- `--container-max: 1760px`. Content sits inside the container; **hero, cylinder and tree are full-bleed**.
- Full-height sections use `min-height: 100svh` (never `100vh`).
- Fixed UI respects `env(safe-area-inset-*)`.

### 5.3 Radius

| Token | Value | Use |
|---|---|---|
| `radius-none` | 0 | Full-bleed sections after intro |
| `radius-xs` | 4 px | Tags, small chips |
| `radius-sm` | 8 px | Inputs, small cards |
| `radius-md` | 12 px | Cards, project panels (2D) |
| `radius-lg` | 20 px | CTA card, modals |
| `radius-xl` | 28 px | Intro frame (hero before scale-up) |
| `radius-pill` | 9999 px | Navbar, buttons |

### 5.4 Z-index

| Token | Value |
|---|---|
| `z-base` | 0 |
| `z-raised` | 10 |
| `z-sticky` | 100 |
| `z-nav` | 1000 |
| `z-overlay` | 1100 |
| `z-transition` | 1200 (TissueTransition layer) |
| `z-toast` | 1300 |

---

## 6. Depth: inner shadows, gradients, glass

**No drop shadows on UI.** Depth is created inward.

### 6.1 Inner-shadow tokens

| Token | Value | Use |
|---|---|---|
| `--inset-raise` | `inset 0 1px 0 0 rgb(255 255 255 / 0.35), inset 0 -3px 0 0 rgb(0 0 0 / 0.22)` | Default button: lit top edge, heavier bottom edge |
| `--inset-raise-dark` | `inset 0 1px 0 0 rgb(255 255 255 / 0.12), inset 0 -3px 0 0 rgb(0 0 0 / 0.5)` | Ink buttons |
| `--inset-pressed` | `inset 0 2px 6px 0 rgb(0 0 0 / 0.30)` | Active / pressed |
| `--inset-field` | `inset 0 -1px 0 0 currentColor` | Sentence-form inputs (underline) |

### 6.2 Gradients

| Token | Value |
|---|---|
| `--gradient-primary` | `linear-gradient(180deg, #FF6038 0%, #FA2E00 52%, #D62700 100%)` |
| `--gradient-ink` | `linear-gradient(180deg, #2A2A2A 0%, #121212 55%, #0A0A0A 100%)` |
| `--gradient-floor` | `radial-gradient(60% 40% at 50% 0%, rgb(250 46 0 / 0.10), transparent 70%)` (cylinder floor glow) |

### 6.3 Liquid glass

Modelled on Apple's Liquid Glass "regular" variant (HIG › Materials): a thin, lightly tinted lens for the **controls and navigation layer only** (navbar, glass buttons, the hero CTA card), never for content. Implemented as the `liquid-glass` Tailwind utility (`globals.css`) plus `LiquidGlassEnhancer` (`components/ui/liquid-glass-enhancer.tsx`).

**Adaptive tint.** Like Apple's regular glass it reads light over bright content and dark over dark content. Tokens are set per surface (`tokens.css`):

| Token | `orange` | `dark` | `light` |
|---|---|---|---|
| `--glass-tint` | `rgb(255 255 255 / .14)` | `rgb(40 40 40 / .32)` | `rgb(255 255 255 / .42)` |
| `--glass-backdrop` | `blur(5px) saturate(165%) brightness(1.1)` | `blur(8px) saturate(160%) brightness(.92)` | `blur(8px) saturate(180%) brightness(1.04)` |
| `--glass-fg` / `--glass-fg-muted` | ink / ink 80 % | white / white 72 % | ink / ink 72 % |
| `--glass-active-bg` / `-fg` | ink / white | white 16 % / white | ink / white |
| `--glass-solid` (no backdrop-filter, reduced transparency) | `#FF7A52` | `#222` | `#F2F2F2` |

The fixed header isn't inside a section, so `HeaderSurface` copies the `data-surface` of whatever section is under it (IntersectionObserver on a 1 px band); before hydration CSS `:has()` borrows the page's first section.

**Layers** (back to front): backdrop (refraction filter + blur/saturate) → tint + crown-to-base body gradient → inner shadows (specular hairline on top, 0.5 px edge thickness, inner glow, base depth) → `::before` 1.5 px rim light whose gradient angle is `--lg-angle` (bright on the light side, fainter on the opposite corner) → `::after` caustic pooling under the crown.

**Refraction (Chromium only).** The enhancer builds a per-element SVG `feDisplacementMap` from a rounded-rect SDF bevel (`lib/glass/displacement-map.ts`) and sets `--lg-filter: url(#…)`, which the utility prepends to `backdrop-filter`. The rim bends the backdrop like a thick lens; the centre is undistorted. Safari/Firefox keep the frosted version. Filters are attached after the intro (they distort under `scale`) and rebuilt on resize.

**Light follows the pointer.** On fine pointers (and without reduced motion) the enhancer eases `--lg-angle` so the rim light turns toward the cursor.

Performance: glass only on small floating controls (never large areas); the enhancer runs at idle after first paint and costs no LCP.

---|---|
| `--glass-bg` | `rgb(10 10 10 / 0.55)` |
| `--glass-blur` | `blur(20px) saturate(160%)` |
| `--glass-border` | `1px solid rgb(255 255 255 / 0.12)` |
| `--glass-shadow` | `var(--inset-glass)` |
| `--glass-fallback-bg` | `rgb(10 10 10 / 0.92)` (when `backdrop-filter` unsupported) |

Performance: `backdrop-filter` is used **only** on the navbar and small floating controls, never on large areas.

---

## 7. Motion

Motion constants live in `src/lib/motion/tokens.ts` and mirror this table. CSS uses the same values as custom properties.

### 7.1 Durations

| Token | ms | Use |
|---|---|---|
| `instant` | 100 | Colour/opacity micro-feedback |
| `fast` | 180 | Hover, press |
| `base` | 280 | Small UI transitions |
| `slow` | 480 | Panels, reveals |
| `slower` | 800 | Section entrances, tissue close |
| `epic` | 1400 | Intro scale-up (max) |

### 7.2 Easings

| Token | CSS | GSAP | Feel |
|---|---|---|---|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | `"power3.out"` | Default UI |
| `ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | `"expo.out"` | Reveals, intro expansion |
| `ease-in-out` | `cubic-bezier(0.76, 0, 0.24, 1)` | `"power4.inOut"` | Room lift, large moves |
| `ease-settle` | — | `CustomEase "settle"` (overshoot ~4 % then rest) | Letters landing, cylinder bounce |

### 7.3 Springs (custom integrator, `lib/motion/spring.ts`)

| Token | Stiffness | Damping | Mass | Use |
|---|---|---|---|---|
| `spring-letter` | 170 | 18 | 1 | Wordmark hover push/pull |
| `spring-soft` | 120 | 14 | 1 | Tissue pull follow-through |
| `spring-snappy` | 300 | 26 | 1 | Button press, small UI |

### 7.4 Stagger

| Token | Value |
|---|---|
| `stagger-letters` | 0.06 s |
| `stagger-words` | 0.04 s |
| `stagger-items` | 0.08 s |

### 7.5 Signature animation specs

| Animation | Trigger | Spec | Reduced motion |
|---|---|---|---|
| **Intro reveal** | First visit per session (`?intro` forces it) | Orange panel pops from 0.9× into a white frame (inset 8–24 px, radius 18–30 px; 520 ms `ease-out-expo`), holds 60 ms, expands edge to edge (1000 ms `ease-in-out`). Pure CSS (`scale` + `transform`, both composited); geometry from an inline pre-paint script. Timings: `lib/motion/tokens.ts` → `intro` | Final state immediately |
| **Wordmark entrance** | With the intro | Letters rise out of the clipped line box, tilted 7° → upright, 55 ms stagger, 950 ms, `ease-settle`; header and hero UI follow from 1080 ms (rise 24 px + fade, 70 ms stagger) | Final state immediately |
| **Wordmark bend** | Cursor near the wordmark (mouse) / horizontal finger drag (touch) | Each letter is a rubber stalk anchored at its baseline: it **curves** (12 strips on a quadratic curve, not a skew) toward a nearby cursor, peaking about half a radius away (radius 1.3 letter widths, max top travel 0.16 em), and is whipped by the cursor's horizontal speed; nearest letter stretches up to 3.5 %. `spring-letter`. Armed only after the intro, at idle. Tunables: `lib/motion/tokens.ts` → `wordmarkBend` | Disabled |
| **Falling words** | Click/tap a loose word (dashed underline; solid + wobble on hover) | Three sentences rotate every 6.5 s (progress bars; pause on hover/focus, while words are down, or off-screen; a bar click stops rotation). Only loose words fall: matter-js (lazy), gravity 1.2, restitution 0.35, friction 0.6, landing on the stats row's top edge; the staying words FLIP into the gaps (650 ms `ease-out-expo`) to form the second sentence. "Let it fall" / "Put them back" button for keyboard and screen readers. Once per session a teaser drops the first loose word and returns it. Tunables: `lib/motion/tokens.ts` → `fallingWords` | No physics: word disappears, gaps close instantly; no auto-rotation |
| **Stats count-up** | Enters viewport (once) | 1200 ms, `power2.out`, tabular numbers | Final number |
| **Ring descent** | Section 2 scrolling in (scrubbed) | Camera arcs from a high diagonal (46° up, 16° off-axis, ring small and seen from above) down and in to eye level, square to the front panel. Spherical interpolation behind a critically damped spring (no overshoot); the ring glides its last third of a panel into place as the camera lands. The image is offset so the ring stays centred in the revealed strip. Tunables: `lib/motion/tokens.ts` → `cylinder` | Starts landed |
| **Ring rotation** | Scroll (pinned, scrubbed) | One project per `75svh`, linear; the ring turns right-to-left so the next project slides in from the right. Lenis smooths the input; Lenis Snap softly settles on the landing and on each project (proximity, 1.15 s ease-out-quart). Subtle pointer parallax (±2.2° yaw, ±1.1° pitch) once landed | Instant, no parallax |
| **Room lift** | Scroll after last panel (scrubbed) | Room group `translateY 0 → -110 %`, `rotateX 0 → -18°`, floor reflection fades; soil layer revealed beneath; `ease-in-out` on scrub | Crossfade to next section |
| **Tissue pull (open)** | Click a panel | Pinch at the panel's top-right corner: only the corner lifts off (0–32 %), drawn up and toward the eye with a soft shadow under it while the rest still lies flat; then the sheet is drawn out and spreads to the viewport, corner first, far corner last, creasing in flight (22–100 %); 1500 ms, timed (`tissue.openMs`), each stage smootherstep-eased in the shader | Crossfade 300 ms |
| **Tissue tuck (close)** | Close / back | Reverse: the far corner lands first, the pinched corner last, then lies down; 1300 ms (`tissue.closeMs`) | Crossfade 300 ms |
| **Story tree** | Scroll (pinned, `450svh`, eased follow) | On plain white: a seed pops in, shallow roots spread and fade, then the tree grows bottom to top in six tiers (one per milestone): one branch at a time (each limb's part of the tier grows from where it enters out to its tips, lowest first; the next starts once it's mostly grown), each branch thickening as it matures, leaves (dense along the thin wood, clustered at the tips) opening right behind it. After each tier a short pause: the milestone lands (tremor up the tree, label shudder, a light haptic tap on phones) and Lenis softly snaps the scroll there. A breeze with slow gusts moves it throughout (thin, high twigs most); a faint warm shimmer drifts from growing tips. Triangle crown with a central leader; "Today" at the peak. Data: `scripts/generate-tree.ts` → `tree.generated.ts`; tunables: `lib/motion/tokens.ts` → `storyTree` | Fully grown tree, all milestones shown, no motion |
| **Ring exit** | Scroll over the section's last screen | The whole room lifts up off the page like a raised panel (the story section is tucked a screen up underneath it, `z-index` below), casting a soft warm shadow on the white page it uncovers; the 3D scene rises 8 % faster than the page for depth. No fades | Same, without the parallax |
| **Lanyard ID cards** | Section enters (35 % in view), drag, tap, cursor brush | Team passes hang from a steel rail on folded orange straps (verlet rope, heavy card at the end). They drop in one after another (140 ms apart), falling past the rail and swinging into place with their print always facing the viewer. Drag to swing (fling keeps its speed), tap to flip to the bio on the back (damped twist spring), brush past with the cursor to nudge. Print is emissive (true colours, `PRINT_GLOW`), the key light adds shading and one tight clear-coat glint; soft shadows on the white wall behind. Two interleaved rows below 1024 px. Code: `features/about-team/`; tunables: `lib/motion/tokens.ts` → `lanyard` | HTML ID cards (same print), no motion |
| **Mobile menu** | Menu button | A white frosted half-sheet (88 % white glass, blur 28 px) unfolds from the button (`scale 0.94 → 1`, items settle 40 ms apart) while the page presses back into a rounded card over ink (`scale 0.92`, 28 px corners) under a 12 % white frost (blur 6 px) | Fade only, no squeeze |
| **Inquiry sent** | Submit succeeds | The note settles in (`translateY 1rem → 0`) and a tick draws itself (circle, then check) | Static tick |
| **Button press** | `:active` | `translateY(1px)`, shadow → `--inset-pressed`, `fast` | Same (no motion concern) |

---

## 8. Components

All components consume semantic tokens and work on every surface.

### 8.1 Glass navbar (`GlassNav`)
- Floating pill, top-centre, `z-nav`, `top: max(16px, env(safe-area-inset-top))`.
- `radius-pill`, height 44 px, 4 px padding.
- Liquid glass (§6.3), adapting to the section beneath. Items: Home · Projects · Contact · Appointment. `text-label`, `--glass-fg-muted` → `--glass-fg` on hover; active item gets an inner pill (`--glass-active-bg` with `--inset-raise-dark`).
- < 768 px: logo + menu button; menu opens a white frosted half-sheet at the top (Manrope, numbered rows with hairline partitions and an ↗ arrow each, primary CTA at the bottom) while the page squeezes back (§7.5 Mobile menu).
- Hides on fast scroll down, returns on scroll up (transform only).

### 8.2 Buttons (`Button`)
| Variant | Background | Label | Depth |
|---|---|---|---|
| `primary` (on dark/light) | `--gradient-primary` | `ink-950` | `--inset-raise` |
| `primary` (on orange) | `--gradient-ink` | `white` | `--inset-raise-dark` |
| `glass` | Liquid glass (§6.3) | `--glass-fg` | Glass layers (§6.3) |
| `ghost` | transparent | `--fg` | `inset 0 0 0 1px var(--border)` |

| Size | Height | Padding-inline | Type |
|---|---|---|---|
| `sm` | 36 px | 14 px | `text-label` |
| `md` | 44 px | 20 px | `text-body-sm` medium |
| `lg` | 56 px | 28 px | `text-body` semibold |

States: hover → `brightness(1.12)` (fine pointers only) · active → `--inset-pressed` + `translateY(1px)` · focus-visible → `2px solid var(--focus-ring)`, offset 3 px · disabled → 40 % opacity, no pointer events. Radius `radius-pill`. Minimum touch target 44 px (sm gets an invisible hit-area extension).

### 8.3 Stat counter (`Stat`)
- Number in `text-stat`, label in `text-label` + `--fg-muted`, right-aligned in hero.

### 8.4 CTA card (`CtaCard`)
- Bottom-right of hero; liquid glass (§6.3), `radius-lg`; eyebrow `text-label` muted, label `text-heading-md` semibold; arrow in a `--glass-active-bg` circle, nudges 2 px toward its target on hover.

### 8.5 Project panel (`ProjectPanel`)
- Aspect ratio **4:5**; image fills; overlay gradient bottom 40 % (`ink-950` → transparent); title `text-heading-md`, category `text-label`.
- In 3D: same art rendered to a texture; 2D fallback uses `radius-md`.

### 8.6 Sentence form (`InquiryForm`)
- Inputs inline in a sentence, inheriting the sentence's font size (`clamp(1.5rem, 3.4vw, 3rem)`, Manrope medium, line-height 1.75), on the `orange` surface.
- Input style: no box; `--inset-field` underline; placeholder in `--fg-muted`; width grows with content (`field-sizing: content` with `ch`-based fallback).
- Shared `Select` in its inline variant, styled as a blank with a chevron (empty state shows "choose" in the placeholder colour). Errors: dashed underline on the field plus an `aria-live` list below.
- Submit = `primary lg` button.

### 8.7 Milestone label (`Milestone`)
- Year in `text-label` (`orange-600`), message in `text-body` `ink-950`, connected to its branch by a 1 px `ink-300` leader line. Max width 28ch.

### 8.8 Team ID card (`IdCard` / 3D lanyard card)
- CR80 card (1 : 1.586), white PVC with a punched slot; header: orange logo mark, DRIMINDESIGN, STUDIO PASS.
- Portrait window 1.04 : 1 (photos from `public/team/`, cropped by `scripts/prepare-team-images.py`, tones untouched) with an orange number tab; name `text-heading-md` semibold, role muted; footer: since-year, ID, barcode. Back: bio and "If found, say hello."
- Strap: brand orange, darker woven edges, DRIMIN in Outrun once per repeat.

### 8.10 Footer (`SiteFooter`)
- `dark` surface: eyebrow + "Let's make it real." + Book a call + email; Explore and Say hello link columns; the DRIMIN wordmark at full width with the cursor bend (`BendingWord`); copyright and back-to-top on a hairline.

### 8.9 Focus & selection
- Focus ring: `2px solid var(--focus-ring)`, offset 3 px, `radius` matches element.
- `::selection { background: var(--selection-bg); color: var(--bg) }`.

### 8.11 Shared dropdown (`Select`)

Form dropdowns share `components/ui/select.tsx`: boxed fields and conversational underlines use one native select with a rounded `ink-50` picker, ink selected rows, orange checkmarks and 44 px option targets. Customizable-select support enhances the picker; other browsers retain their native keyboard/touch picker. Menus and triggers stay within the viewport and honour reduced motion.

### 8.12 Responsive case studies and booking

Project case studies keep app-screen swiping inside a bounded strip; their story grid uses shrinkable tracks so it cannot expand the page. Mobile case images use the generated 800 px source through responsive `<picture>` selection; larger screens retain full-size sources. Appointment fieldsets and grid tracks also shrink within the viewport, with dates scrolling inside their own strip.

---

## 9. 3D art direction (ring section)

Modelled on a thin, upright panoramic ring in an endless hazy room (client reference: Motley Crowd), recoloured to the brand. Code: `src/features/project-cylinder/scene/`.

| Parameter | Value |
|---|---|
| Ring | Thin, open band standing on the floor: no caps, no thickness. 8 panels at 7:5 (4 × 2.86 units), hairline seams; radius follows from the panel count. Turns about Y |
| Panels | Unlit, true-colour images, excluded from tone mapping and room fog: bright outside, dimmed and warmer inside so the far inner wall reads in shadow from above. The ring uses native 1400 px WebP on high/medium tiers and on canvases wider than 1000 physical pixels; smaller low-tier canvases use 1000 px (7:5, `public/projects/<slug>-v2-<width>.webp`), built from `assets/generated-projects/` by `scripts/prepare-generated-images.py`. Maximum supported anisotropy and a −0.5 mip bias preserve small print on the curve while keeping mipmaps to prevent shimmer. Repeated panels share one GPU texture per project. Canvas DPR: high 1.5–2, medium 1.25–2, low 1–1.5; geometry and reflections remain tiered. At least 8 panels; projects repeat around the ring |
| Room | A lit studio backdrop (infinity cove) in the hero's exact brand orange, no walls or corners (`palette.ts`): `#FA2E00` at eye level (also the fog colour, so the floor dissolves seamlessly), a warmer key-light hot spot `#FF5B28` behind the ring, falloff toward the top (`#E22900`) and sides (`#D42600`). The section uses `data-surface="orange"`: small overlay text in ink, the project title in white |
| Floor | Satin reflector: contact-hardening reflection (sharp at the band's foot, blurring with distance), lit orange under the ring (`#F22D00`) falling to `#C92400` near the camera, fog fade |
| Grounding | No fake shadow decal. Each panel spills its own average colour onto the floor (`light-spill.ts`): zero at the contact line (a natural crease), peaking just outside, decaying with a soft tail that reaches exactly zero inside its patch. The spill is written in display (sRGB) values: the canvas blends additively in display space, where a faint linear tail turns into a visible band |
| Seam with the hero | Same orange on both sides, so there is no seam to hide. The hot spot and side falloff start just above the horizon so the fogged floor never shows a line against the backdrop |
| Figures | Three small, jointed profile silhouettes (`figure-rig.ts`, vector shapes; ~⅓ of the band's height) kept to the panel's sides. A pair on the right converse (alternating speaker every 7 s: forearm gestures, lean-in, nods; listener nods, hands in pockets; both breathe and shift weight). A stroller on the left walks a short line with eased starts and stops, pauses to look up at the screen and turns in place. When the ring turns, everyone looks up and one of the pair points. Animated at ~30 fps only while the section is on screen; static under reduced motion. Contact shadow plus a long soft shadow cast away from the ring |
| Camera | FOV 35°. Landed at eye height 1.15, looking slightly up. Landscape: panel fills ~56 % width, ring shifted left (16 % of width) with the copy column on the right. Portrait: panel centred, nearly full width |

## 10. Illustration direction (Roots → Tree)

Background: `white`. Style target: **refined illustrative realism**, botanical-plate quality with clean vector shapes (final style pending client reference).

| Element | Colours | Notes |
|---|---|---|
| Soil layers | `#3B2A20`, `#5A4030`, `#7A5A42` | Horizontal strata, subtle grain via pattern, darker with depth |
| Roots | `#6B4B36` → `#8A6A50` (tips) | Tapered fills, fine root hairs near tips |
| Bark | `#4A3527` → `#2E2119` (shadow side) | Tapered filled branches; darker on one side for volume |
| Leaves (young → mature) | `#A7C957` → `#6A994E` → `#386641` | Unfold with rotation; colour matures over growth |
| Blossoms / accent leaves | `orange-500`, `orange-300` | Appear at 90–100 % growth: the tree becomes the brand |
| Milestone leaders | `ink-300` | 1 px lines |

Rules: no outlines around shapes; volume through two-tone fills; asymmetric structure; leaves vary in size (±25 %), rotation (±35°) and timing.

---

## 11. Iconography & imagery

- Icons: 24 px grid, 1.5 px stroke, round caps/joins, `currentColor`. Arrow (↗) is the signature CTA icon.
- Project imagery: minimum 2000 px on the long edge, delivered as high-quality JPEG/PNG; pipeline outputs AVIF/WebP and per-tier texture sizes.
- Portraits: consistent lighting/background treatment across the team.

---

## 12. Token implementation (reference)

```css
/* src/styles/tokens.css (excerpt; full file generated from this document) */
:root {
  --color-orange-500: #FA2E00;
  --color-orange-600: #D62700;
  --color-ink-950: #0A0A0A;
  --color-white: #FFFFFF;

  --gutter: clamp(1rem, 3vw, 2.5rem);
  --space-section: clamp(4rem, 10vw, 10rem);

  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-slow: 480ms;
}

[data-surface="orange"] { --bg: var(--color-orange-500); --fg: var(--color-ink-950); --fg-display: var(--color-white); --accent: var(--color-ink-950); --focus-ring: var(--color-ink-950); }
[data-surface="dark"]   { --bg: var(--color-ink-950);    --fg: var(--color-white);    --fg-display: var(--color-white); --accent: var(--color-orange-500); --focus-ring: var(--color-orange-400); }
[data-surface="light"]  { --bg: var(--color-white);      --fg: var(--color-ink-950);  --fg-display: var(--color-ink-950); --accent: var(--color-orange-600); --focus-ring: var(--color-orange-600); }
```

```css
/* src/styles/globals.css: expose to Tailwind v4 */
@import "tailwindcss";
@import "./tokens.css";

@theme inline {
  --color-bg: var(--bg);
  --color-fg: var(--fg);
  --color-accent: var(--accent);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --breakpoint-3xl: 120rem;
  --breakpoint-4xl: 160rem;
}
```

---

## 13. Pending inputs

- [x] Display and body fonts (Outrun, Manrope). ⚠️ Outrun commercial licence still needed
- [x] Logo package (`assets/brand/RGB`): the mark alone (EM in the D outline, `BrandMark`) sits top-left in the surface's display colour (white on orange), icon → `app/icon.svg`, `apple-icon.png`, `favicon.ico`, PWA icons. Note: the logo files use `#FF5500` while the site brand is `#FA2E00`; confirm which orange is canonical
- [ ] Tree style reference image
- [ ] Confirm About/Team and Inquiry surfaces (proposed: light, orange)
