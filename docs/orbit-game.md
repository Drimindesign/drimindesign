# Idea to Orbit: game handoff

A pixel-art side-scroller on `/play`, in the spirit of teslaroadstergame.com's craft (not its gameplay).
Everything is drawn in code on a low-resolution canvas scaled up by a whole number. There are no image,
model or sound files: sound is generated live with Web Audio.

**Story:** Discover → Build → Launch → Grow.
**Stages:** forest on foot → forest road by car → liftoff → Moon in low gravity.
Each finished stage unlocks a studio project card.

## Current state

Phase 1 is written and plays: `engine/audio.ts`, `engine/game.ts`, `game-mount.tsx`, `orbit-page.tsx`,
`orbit.module.css` and `index.ts`; `src/app/play/page.tsx` renders `OrbitPage` from `@/features/orbit`.
`tsc`, ESLint and `next build` pass (build from PowerShell: under Git Bash on this machine Turbopack fails to
spawn its loader process, exit `0xc0000142`).

Checked in the browser at 1280×720: walking, the "E · Get in" prompt by the door, walk-to-door → boarding →
car, driving (speed gauge), thrusters lifting the car with gas plumes and the tank draining, landing, Pluto
gravity toggle. No console errors. **Not yet checked:** getting out, sound by ear, phone landscape/portrait
with the touch pads, and the side-by-side with teslaroadstergame.com.

## Done (`src/features/orbit/`)

### `engine/` (physics, SI units, 120 Hz fixed step)
- `config.ts`
  - `PPM = 16` (1 px = 6.25 cm); `VIEW_MIN` 480×270 game px.
  - `CAR` thruster tuning: `thrust`, `thrustKick`, `thrustTank`, `landingBurn`, `nozzles`.
- `vehicle.ts`: raycast car on a height field (spring/damper suspension, grip limited by load, body
  collision, rollover reset).
  - Thrusters: a kick off the ground (`thrustPressed`) and held thrust (`thrust`).
  - An **automatic braking burn** fires when sinking fast near the ground: the thrusters work going up
    *and* coming down.
  - Exposes `thrust` (0 … 1) and `altitude`.
- `character-controller.ts`: feet-point body with coyote time, jump buffer and variable jump height;
  gravity per planet.
- `animator.ts`: procedural rig driven by physics.
  - Distance-driven gait (no foot slide), IK legs on slopes, walk/run blend.
  - Air poses, critically damped landing, ponytail Verlet chain.
  - Exposes `gaitPhase`: a foot lands as it crosses 0 and 0.5.
- `terrain.ts`, `noise.ts`, `input.ts` (keyboard plus on-screen actions: `left right jump interact switch
  planet`).

### `pixel/` (rendering)
- `painter.ts`: whole-pixel polygon/disc/capsule/line fills, Bayer dithering, and `outlineAndRim()`
  (dark outline plus warm sun rim on the sun-facing edges).
- `palette.ts`: `DAWN` palette (low sun on the left, violet distance, warm rims).
- `world.ts`: dawn forest.
  - Dithered sky with sun and clouds; mountains; far pines in mist; tree line over a lake with
    reflection; backlit near trunks.
  - God rays (screen-composited); per-column ground with swaying grass; dark foreground grass; motes.
  - Layers are seeded tiles of 256 px.
  - API: `resize(w, h, cameraY)`, `drawBack`, `drawGround`, `drawFront`, `sun`.
  - Remove the unused private `screenX` if TypeScript complains.
- `car-sprite.ts`: hypercar painted once, in empty and occupied versions (`createCarSprite()` returns
  `{empty, occupied, ox, oy}`); `drawWheel(p, x, y, spin)`.
- `particles.ts`: pooled thruster gas (drag, buoyancy, expansion, **ground-effect fan-out**) and dust;
  `gas()`, `dust()`, `update()`, `draw(painter, toScreen, frame)`.
- `explorer-sprite.ts`: `EXPLORERS` (female and male looks from the character handoff); `ExplorerSprite`
  rasterises a `RigPose` into a 56×56 canvas (feet at `footX/footY`), mirrored by facing, then outline
  and rim.

## Phase 1 (look test, playable): written

### 1. `engine/audio.ts`: Web Audio, unlocked on the first pointer or key press, with a mute toggle
- Engine: electric whine, two oscillators.
  - Pitch: `120 + speed*18` Hz, plus a low hum at `45 + speed*1.5` Hz.
  - Gain follows the throttle; on only while driving.
- Thrust: looped white noise through a band-pass (~900 Hz) plus a low-pass rumble (~180 Hz).
  - Gain follows `car.thrust`; ramp with `setTargetAtTime`.
- One-shots:
  - footstep: 60 ms noise through a ~1.8 kHz band-pass;
  - jump: noise whoosh;
  - land: 90→40 Hz thump plus crunch;
  - door: two square-wave clicks;
  - thruster ignition: low-passed noise burst.
- Ambience: wind (low-passed noise, slow gain wobble) and bird chirps (3→4.2 kHz sine sweeps every 2–6 s).

### 2. `engine/game.ts`: rebuild on the new renderer
- **Resize:** `scale = max(1, floor(min(devW/480, devH/270)))`; canvas pixel size `ceil(dev/scale)`; CSS
  size `= w*scale/dpr`; `imageSmoothingEnabled = false` after every resize; `world.resize`.
- **Loop:** fixed 120 Hz steps, `MAX_STEPS`, interpolated draw, own rAF, paused when the tab is hidden.
  The press flags go to the first step only.
- **Modes:** `foot → walkToDoor → boarding → car → alighting`.
  - Walk to the door, ease into the seat, fade out; reverse on exit.
  - Car parked (handbrake) when empty.
  - `C` switches explorer; `G` toggles Earth/Pluto gravity (for testing).
- **Car input:** `throttle = move`, `thrust = jumpHeld`, `thrustPressed = jumpPressed`.
- **Particles:**
  - Each step while `car.thrust > 0`, spawn one gas particle per nozzle along the car's down axis.
  - On a ground kick, a burst of ~24 per nozzle.
  - On a hard car landing, dust plus `sound.land`.
  - On foot: dust on jump/land, footstep sound on `gaitPhase` crossings while grounded and moving.
- **Camera:** follow the explorer or the car (blend on boarding).
  - Look-ahead `vx*0.35–0.45`, capped at 30% of the view.
  - Ground at ~70% of the view height (`cam.y = groundY + 0.2*h/PPM`).
  - Snap to whole pixels when drawing.
- **Draw order:**
  1. `world.drawBack`;
  2. the headlight cone (when occupied: dithered, screen-composited, ~6 m);
  3. `world.drawGround`;
  4. contact shadows (dark pixel rows, narrower with altitude);
  5. car sprite (rotate with `-angle`, nearest-neighbour) plus wheels;
  6. explorer sprite;
  7. particles;
  8. `world.drawFront`.
- **HUD (DOM writes only, no React state per frame):** `data-mode`, `data-explorer`, `data-planet`,
  prompt text, speed (km/h), thrust-tank bar via `--tank`.

### 3. `game-mount.tsx`, `orbit-page.tsx`, `orbit.module.css`, `index.ts`; point `app/play/page.tsx` at `@/features/orbit`
- Port these from the deleted long-drive versions (same patterns): dynamic import with `retryImport`,
  `ResizeObserver`, shared pointer handlers with `data-action` (the React compiler forbids building
  handlers during render), and touch pads only on `(pointer: coarse)`.
- **Canvas:** `image-rendering: pixelated`; the page is `100svh`, `overflow: hidden`, with
  `data-lenis-prevent`.
- HUD title "IDEA TO ORBIT · 01 DISCOVER", a mute button, and keyboard hints.

### 4. Check
- `npx tsc --noEmit`, `npx eslint src/features/orbit src/app/play`.
- In the browser at 1280×720, phone landscape and portrait: walk, run and jump; get in; drive; thrust
  up, hover, release, then see the braking burn on the way down; land; get out; sound on and muted.
- Compare against teslaroadstergame.com for crispness and light.
- No console errors.

## Later phases
2. **Stage 1 gameplay:** energy fruit (climb a tree with the action button), a charging wild boar (jump
   over it), checkpoints with a soft respawn; fruit fills the thruster tank.
3. **Stage 2 road:** logs, ramps, a ravine needing a thruster jump.
   **Stage 3 launch:** hold to burn; the sky darkens and the planet curves away.
   **Stage 4 Moon:** low gravity, craters, plant the flag.
   **Finish screen:** time, fruit, clean landings, personal best saved in `localStorage`.
4. **Site:**
   - project reward cards linking to `/projects/[slug]`;
   - "Start a project" → `/contact` and "Book a call" → `/appointment`; share button;
   - `/play` in the footer and sitemap;
   - the ring's last panel runs the game in demo mode (cheap at this resolution; paused off-screen) and
     opens `/play` with the tissue transition.

## Decisions still open
- Main-menu "Play" link, or footer only.
- Which four projects are the stage rewards.
