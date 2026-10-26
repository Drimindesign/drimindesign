# Product Requirements Document — Drimin Design Website

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Last updated** | 2026-10-25 |
| **Stack** | Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS v4 |
| **Companion docs** | [AGENTS.md](AGENTS.md) (engineering rules) · [DESIGN.md](DESIGN.md) (design system) |

---

## 1. Overview

A portfolio and studio website that feels physical. Every section has motion you can feel: the page scales open, letters react to the cursor, words fall when clicked, a 3D cylinder rolls down a slope and settles on a glossy floor, project cards are pulled out like tissue, the room lifts away, and a tree grows from its roots to tell the studio's story.

The bar is **memorable, not generic**: each animation must have a physical idea behind it (weight, gravity, cloth, growth) and must also be **fast**: Lighthouse 95–100 on mobile and desktop.

### 1.1 Goals

1. Make visitors remember the studio after one visit (signature interactions).
2. Show projects in a way that is both delightful (cylinder) and easy to browse (Projects page).
3. Turn visitors into leads through a creative inquiry section and an appointment booking flow.
4. Score 95–100 on Lighthouse Performance, Accessibility, Best Practices, and SEO.
5. Feel the same on a 375 px phone and a 2560 px monitor: same story, same moments, quality scaled to the device.

### 1.2 Non-goals (v1)

- CMS-driven editing (content lives in typed files in the repo; a CMS can be added behind the content layer later).
- User accounts, authentication, or client portals.
- Multi-language support (the structure must not block adding it later).
- E-commerce or payments.

### 1.3 Success metrics

| Metric | Target |
|---|---|
| Lighthouse Performance (mobile, simulated throttling) | ≥ 95 |
| Lighthouse Performance (desktop) | ≥ 98 |
| Lighthouse Accessibility / Best Practices / SEO | 100 / 100 / 100 |
| LCP (p75, real users) | < 2.0 s |
| INP (p75) | < 150 ms |
| CLS (p75) | < 0.05 |
| Animation frame rate | 60 fps on mid-range phones (e.g. Pixel 6a, iPhone 12); never below 45 fps |
| Inquiry form completion rate | Baseline after launch; then optimise |

---

## 2. Users

| Persona | What they want | What we must do |
|---|---|---|
| **Prospective client** (founder, marketing lead) | See work quality fast, then contact the studio | Projects reachable within one scroll; clear CTA; fast load on mobile data |
| **Recruiter / peer designer** | Be impressed, explore craft | Signature interactions that reward exploration |
| **Search engine / social crawler** | Readable content and metadata | All content in semantic HTML (never only in canvas), structured data, OG images |
| **Visitor using assistive tech or reduced motion** | Same content without motion sickness | Full keyboard support, reduced-motion variants, accessible names on everything |

---

## 3. Information architecture

```
/                          Home (all signature sections)
/projects                  Project index (grid / list, filterable)
/projects/[slug]           Project detail (opened from cylinder with tissue-pull transition)
/contact                   Contact page (creative inquiry form)
/appointment               Appointment booking (needs database — provider TBD)
/sitemap.xml, /robots.txt  Generated
```

**Primary navigation (glass navbar):** Home · Projects · Contact · Appointment.

---

## 4. Home page — section by section

The home page is a single scroll story with three main background moods:

| # | Section | Background |
|---|---|---|
| 1 | Hero | **Brand orange** `#FA2E00` |
| 2 | Cylinder (projects) | **Dark** (near-black, with the orange as the accent) |
| 3 | Roots → Tree (story) | **White** |
| 4 | About & Team | TBD (proposal: white continuing into orange accents) |
| 5 | Inquiry | TBD (proposal: orange, to bookend the page with the hero) |
| — | Footer | Dark |

### 4.1 Intro — "the page opens"

**Behaviour**
- On the first visit in a session, the orange hero panel starts **inset** inside a white frame (rounded corners, ~16–24 px margin, like the reference image).
- It then **scales out** smoothly to fill the full viewport (corners straighten, white frame disappears).
- Hero content (wordmark, stats, CTA) settles in after or during the expansion.

**Rules**
- Runs once per session (`sessionStorage` flag); repeat navigations to Home skip straight to the final state.
- Must not delay LCP: the wordmark is visible in the first paint (animated with `clip-path` / `transform`, never `opacity: 0` on the LCP element).
- Total duration ≤ 1.4 s. Scroll is not locked for longer than the animation.
- Reduced motion: no scale, content appears in its final state.

### 4.2 Hero — wordmark, description, stats, CTA

**Layout** (from the reference image, recoloured to orange):
- Top-left: logo + small tagline.
- Top-centre: glass navbar.
- Top-right: secondary actions (e.g. "Sign in"-style pill buttons → repurpose as "Book a call" / "Contact").
- Huge display **wordmark** anchored top-left, bleeding off the edge, in the display font (TBD).
- Right side: stat counters (e.g. `8K+`, `60+`, `0`) with small labels.
- Bottom-left: short **description** (interactive, see 4.2.2).
- Bottom-right: CTA card.

#### 4.2.1 Wordmark letters
- **Entrance:** letters arrive one by one (staggered rise from a masked baseline), with a tiny settle "jitter" at the end.
- **Hover (pointer devices):** each letter is pushed away from / pulled toward the cursor with spring physics and returns when the cursor leaves. Letters never overlap their neighbours by more than ~10 %.
- **Touch devices:** tapping or dragging over the wordmark nudges letters the same way.
- The wordmark stays a real text element (`<h1>`), split into spans after hydration for animation, with the full word kept as the accessible name.

#### 4.2.2 Falling-word description
- Three sentences rotate (approved copy in `src/content/site.ts`):
  - We ~~don't just~~ make brands ~~look good. We make them~~ move. → "We make brands move."
  - Every idea ~~starts as a dream. We design the rest until it~~ becomes real. → "Every idea becomes real."
  - We turn ~~your wildest~~ vision and ~~boldest~~ creativity into ~~a living, breathing~~ reality. → "We turn vision and creativity into reality."
- Only the loose words (dashed underline) fall; clicking any other word does nothing. A one-time teaser after the intro drops one loose word and returns it so visitors discover the interaction.
- The description is a sentence written so that it has **two readings**.
- Some words are interactive. When clicked/tapped, the word **falls** with gravity, bounces, and comes to rest on the floor of the hero.
- After the removable words have fallen, the **remaining words form a second, meaningful sentence**.
  - Example: "We don't just ~~make things look~~ design ~~for~~ brands ~~that~~ move." → "We design brands that move."
- Copy must be authored deliberately (content task, see §9). The component accepts the sentence as data: `[{ text, removable }]`.
- A "reset" affordance (small button) lets words float back up.
- Keyboard: each removable word is a `<button>`; Enter/Space drops it.
- Reduced motion: words fade and collapse instead of falling.
- Physics library is loaded only on first interaction (no cost on page load).

#### 4.2.3 Stats & CTA
- Stats count up when they enter the viewport (once).
- CTA uses the primary button style (inner-shadow, see DESIGN.md).

### 4.3 Cylinder section — projects in 3D

**Scene:** dark background. A horizontal cylinder (axis left↔right, like a rolling pin / drum lying on its side) whose outer surface is made of project panels. It sits on a **glossy, reflective floor** so it reads as resting on a real surface.

> **Open question:** orientation is assumed to be *lying on its side, rolling forward/back*. Alternative: standing upright, spinning left↔right without the tilt from the reference. Confirm before build (see §10).

**Sequence**
1. **Arrival — "rolling down the hill":** as the user scrolls from the hero into this section, the cylinder rolls down a slope from above, hits the floor, does a **small bounce**, and **settles**. This plays as a one-shot physical animation triggered at a scroll threshold (not scrubbed, so the bounce never plays backwards awkwardly). Scrolling back above the threshold reverses it smoothly.
2. **Browsing:** the section is pinned. Further scrolling **rotates the cylinder** around its axis, bringing each project panel to the front. The front-most project shows its title and category as HTML overlay text.
3. **Exit — "the room goes up":** after the last project has passed, continued scrolling makes the entire room (floor, reflection, cylinder) **lift upward and tilt away**, smoothly and scroll-scrubbed, revealing the ground beneath, which is where the roots section begins.

> **Open question:** "room going up" is interpreted as *the room lifts away, revealing the soil below*. Alternative: the camera tilts up toward a ceiling. Confirm before build.

**Interaction**
- Hover (pointer): the hovered panel lifts slightly and its edge catches light.
- Click/tap a panel → **tissue-pull transition** (4.4) → project detail page.
- Keyboard: panels are reachable via an off-screen, focusable list of links (one per project); focusing one rotates the cylinder to it; Enter opens it.

**SEO / a11y:** the project list is rendered as real HTML links in the DOM (visually hidden or as overlay labels), so crawlers and screen readers see every project regardless of WebGL.

**Fallback:** if WebGL is unavailable or the device is low-tier, render a static, scroll-driven 2.5D carousel (CSS transforms) of the same panels.

### 4.4 Tissue-pull transition (cylinder → project page)

**Physical idea:** pulling a tissue out of a tissue box.

**Open**
1. The clicked panel's **corner is pinched** (the corner nearest the click point, default top-right).
2. That corner lifts first; the rest of the panel follows with a delay, bending like soft fabric, with fine wrinkles near the pinch.
3. The panel slides **out of its slot** in the cylinder.
4. It relaxes, flattens and **spreads to fill the viewport**, and its image becomes the hero image of the project page.
5. The project page content fades/slides in beneath it.

**Close**
1. The page gathers toward a corner (reverse pinch), wrinkles return.
2. It **tucks back into its slot** on the cylinder with a slight wave.
3. The user is back exactly where they were (cylinder rotation and scroll position preserved) and can keep scrolling.

**Rules**
- Implemented in WebGL (subdivided plane + vertex shader deformation + spring physics), not CSS.
- Duration: open ≈ 900–1200 ms, close ≈ 700–900 ms; navigation must feel instant (the route is prefetched).
- The project URL is a real route (`/projects/[slug]`). Visiting it directly renders the full page without the transition.
- Browser back button triggers the close animation when coming from Home.
- Reduced motion: crossfade only.

### 4.5 Roots → Tree story section

> **Built (v1):** plain white background (no soil). Triangle tree growing bottom to top in six tiers, one per milestone, with a pause, tremor and soft scroll snap at each; constant breeze; faint shimmer. Milestones (real): 2023 first freelance client · 15+ brand identities · 5–10 websites incl. e-commerce · 3 apps shipped · 2 apps in progress · Today: multiple projects at once. The spec below is the original brief.

#### Original brief

**Background:** white. **Physical idea:** the studio grew like a tree.

**Sequence (scroll-scrubbed, pinned, reversible)**
1. **Underground:** the section opens beneath the soil line. A seed; fine roots spread outward and downward. Headline: **"We begin with roots."**
2. **Sprout:** a shoot breaks the soil surface; first two leaves unfold.
3. **Growth:** the stem thickens into a trunk, splits into branches; the view climbs with the tree as it grows.
4. **Story:** milestone messages (year + short line) appear attached to branches as each branch grows, e.g. "2019 — First client", "2021 — Team of 5", "2024 — 60+ projects".
5. **Canopy:** leaves unfold individually with slight rotation and colour maturing from young to deep green; finally a few blossoms/leaves in **brand orange** (the tree "becomes" the brand).
6. **Idle:** once fully grown, gentle wind sway.

**Non-generic requirements (must)**
- Branches are **filled, tapered shapes** that thicken as they age (secondary growth), never uniform strokes with `stroke-dashoffset`.
- Branching structure is **procedurally generated** (space-colonisation or L-system) at build time with a fixed seed, then hand-tuned; not symmetric.
- Leaves are a small set of hand-drawn leaf shapes, instanced with variation in size, rotation, colour and timing.
- Child branches start only after the parent reaches their fork point.
- Roots include fine root hairs; soil has subtle texture/layering.

**Performance:** SVG path data is precomputed at build time and shipped as static data; per-frame work is only updating a progress value per branch. Node count budget: ≤ 1500 animated SVG nodes; if exceeded, render leaves to canvas.

> **Open question:** visual style reference (realistic botanical illustration vs. refined line-art vs. painterly). Request a reference image from the client.

### 4.6 About & Team

- Studio intro + team members (photo, name, role).
- Has its own entrance animation (to be designed; must follow the same "physical idea" rule).

### 4.7 Inquiry section (home) / Contact page

- Creative, conversational form. Proposal: a **fill-in-the-blanks sentence** where the blanks are inputs:
  "Hi, I'm `[name]` from `[company]`. We need help with `[service ▾]` and our budget is around `[budget ▾]`. Reach me at `[email]`."
- Validation inline and accessible; submission via a Server Action; success state with a small celebratory animation.
- Spam protection: honeypot + rate limit (provider TBD).

### 4.8 Footer
- Dark; logo, nav links, socials, email, legal, copyright.

---

## 5. Other pages

### 5.1 `/projects`
- Grid of all projects (image, title, category, year), filter by category.
- Each card links to `/projects/[slug]` (standard page transition, not the tissue pull).

### 5.2 `/projects/[slug]`
- Hero image (the panel that expanded), title, client, year, services, description, gallery, next-project link.
- Statically generated for every project (`generateStaticParams`).
- Close/back control returns to the origin (Home cylinder with tissue-close, or Projects grid).

### 5.3 `/contact`
- Same creative inquiry form as 4.7 plus studio contact details and map/location (optional).

### 5.4 `/appointment`
- Pick a service → pick a date → pick a time slot → enter details → confirm.
- **Requires a database** (provider to be specified by the client). Data layer is built behind a repository interface so the provider can be plugged in without touching UI.
- Confirmation email (provider TBD).
- Double-booking prevented server-side (transactional slot reservation).

---

## 6. Global UI

- **Navbar:** floating glassmorphism pill (translucent, backdrop blur, thin light border, subtle inner highlight). Active route indicator. Collapses into a compact menu on small screens.
- **Buttons:** no drop shadows. Depth comes from an **inner shadow at the bottom edge** and/or a vertical gradient, so the button looks tactile and pressed into the surface. See DESIGN.md §6.
- **Smooth scrolling** on all pages (respects reduced motion and native touch scrolling).
- **Cursor:** native cursor; optional custom cursor on desktop only (TBD).

---

## 7. Non-functional requirements

### 7.1 Performance
- Targets in §1.3. Detailed engineering rules in AGENTS.md §5.
- Hero renders as server HTML + CSS only; all heavy JS (3D, physics, tree) loads after first paint and only near its section.
- Per-device quality tiers (high / medium / low) for 3D and effects.

### 7.2 Responsiveness
- Supported widths: 320 px → 2560 px+. Same narrative and same signature moments on every size; layout and quality adapt.
- Touch-first equivalents for every hover interaction.

### 7.3 Accessibility
- WCAG 2.2 AA.
- `prefers-reduced-motion`: every animation has a reduced variant (documented per component).
- All interactive elements keyboard reachable with visible focus.
- Colour contrast per DESIGN.md §2.4 (white body text on orange is **not** allowed; ink text on orange is).

### 7.4 SEO
- Unique title/description per route, canonical URLs, Open Graph + Twitter images (generated), `sitemap.xml`, `robots.txt`, JSON-LD (Organization, WebSite, CreativeWork per project, BreadcrumbList).
- All meaningful content present in HTML at first response.

### 7.5 Browser support
- Last 2 versions of Chrome, Edge, Safari (macOS + iOS), Firefox. Samsung Internet latest.
- WebGL2 preferred; WebGL1/no-WebGL fallback as described in 4.3.

---

## 8. Technical approach (summary)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router, Cache Components + Partial Prefetching (enabled) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 with design tokens as CSS variables (`@theme`) |
| DOM animation | GSAP (+ ScrollTrigger, SplitText) |
| Smooth scroll | Lenis (synced with ScrollTrigger) |
| 3D | three.js via React Three Fiber + drei (reflective floor, shaders) |
| Physics (falling words) | Matter.js, lazy-loaded on first interaction |
| Tree | Build-time procedural generation → static SVG path data; animated with GSAP |
| Route-level state | React `<Activity>` (built into Next 16 with Cache Components) keeps Home mounted while a project is open |
| Forms | Server Actions + Zod validation |
| Database (appointments) | TBD by client, behind a repository interface |
| Hosting | TBD (Vercel recommended) |

Full engineering rules: [AGENTS.md](AGENTS.md).

---

## 9. Content needed from client

- [x] Logo package and studio name (Drimindesign, tagline "Vision and creativity to reality")
- [x] Brand colour: `#FA2E00`
- [x] Display font (Outrun; **commercial licence required before launch**) + body font (Manrope, OFL)
- [ ] Falling-word description: confirm the two readings (we can draft options)
- [ ] Stats (numbers + labels)
- [ ] Projects: title, slug, client, year, category, services, cover image (min 2000 px), gallery, description
- [ ] Story milestones for the tree (year + one line each, 5–8 items)
- [ ] Team: photos, names, roles
- [ ] Contact details, socials
- [ ] Appointment: services offered, durations, working hours, time zone
- [ ] Database + email provider for appointments/inquiries
- [ ] Tree style reference image

---

## 10. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Cylinder orientation: lying on its side (rolls forward/back) or upright (spins left/right)? | Lying on its side |
| 2 | "Room goes up": room lifts away revealing soil, or camera tilts up? | Room lifts away |
| 3 | Fonts? | Placeholder system stack until provided |
| 4 | About/Team and Inquiry section backgrounds? | White, then orange |
| 5 | Tree visual style? | Refined illustrative realism |
| 6 | Database / email providers? | Interface only, in-memory mock in development |
| 7 | Hosting platform? | Vercel |

---

## 11. Milestones

| # | Milestone | Includes |
|---|---|---|
| M0 | Foundations | Project setup, tokens, fonts, layout shell, navbar, buttons, smooth scroll, SEO plumbing |
| M1 | Hero | Intro scale-up, wordmark letters, falling-word description, stats, CTA |
| M2 | Cylinder | 3D scene, roll-down + bounce, reflective floor, scroll rotation, fallback |
| M3 | Tissue pull | Open/close transition, project detail page, state restoration |
| M4 | Room lift + Tree | Room exit, roots → tree story |
| M5 | About, Team, Inquiry, Footer | Sections + creative form |
| M6 | Projects, Contact, Appointment pages | Incl. database integration |
| M7 | Hardening | Performance pass to targets, a11y audit, cross-device QA, launch |
