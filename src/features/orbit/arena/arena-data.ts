/*
 * The arena's files: its description (arena.json, written by the Blender export), the slices'
 * renders, depth grids and wind masks, the light probe, and the fighters. Downloaded once with a
 * progress readout; the browser keeps them (immutable, long-cached), so the next visit is instant.
 */

export const ARENA_BASE = "/game/arena/";
export const FIGHTERS_BASE = "/game/fighters-hd/";

export interface ArenaLight {
  name: string;
  type: "SUN" | "SPOT" | "POINT" | "AREA";
  position: [number, number, number];
  direction: [number, number, number];
  colour: [number, number, number];
  energy: number;
  angle?: number;
  blend?: number;
}

export interface ArenaMeta {
  /** The eye point every slice was rendered from (three.js metres, Y up). */
  eye: [number, number, number];
  /** The view's centre heading (degrees, clockwise from Blender's +Y) and each slice's offset from it. */
  heading: number;
  slices: number[];
  /** A slice's extent in tan units: half its width, and above / below the horizon. */
  half: number;
  up: number;
  down: number;
  size: [number, number];
  grid: number;
  /** Where the fight happens: the line's centre and direction (on the ground), half its length, and the ground height along it. */
  fight: { centre: [number, number, number]; along: [number, number, number]; half: number; ground: [number, number][] };
  exposure: number;
  lights: ArenaLight[];
  /** The bonfire's base (drawn live), if the set has one. */
  fire?: [number, number, number] | null;
}

/** One camera position's set: its description and its slices (render, wind mask, depth). */
export interface ArenaShot {
  meta: ArenaMeta;
  colour: Blob[];
  sway: Blob[];
  depth: Uint16Array[];
}

/** The camera positions the set was shot from: the wide from the deck, and the low angle on the lawn. */
export const SHOTS = [{ folder: "", slices: 3 }, { folder: "low/", slices: 2 }] as const;

export interface ArenaFiles {
  meta: ArenaMeta;
  shots: ArenaShot[];
  probe: ArrayBuffer;
  hero: ArrayBuffer;
  knight: ArrayBuffer;
  brute: ArrayBuffer;
}

export interface ArenaData {
  meta: ArenaMeta;
}

/** Every file with its rough size (bytes), for the download screen before anything is fetched. */
export function arenaManifest(): { url: string; bytes: number }[] {
  const files = [{ url: `${ARENA_BASE}probe.hdr`, bytes: 420_000 }];
  for (const shot of SHOTS) {
    const base = `${ARENA_BASE}${shot.folder}`;
    files.push({ url: `${base}arena.json`, bytes: 5_000 });
    for (let i = 0; i < shot.slices; i++) {
      files.push({ url: `${base}tile${i}.webp`, bytes: 560_000 }, { url: `${base}tile${i}.sway.png`, bytes: 40_000 }, { url: `${base}tile${i}.depth.bin`, bytes: 61_000 });
    }
  }
  files.push({ url: `${FIGHTERS_BASE}hero.glb`, bytes: 450_000 }, { url: `${FIGHTERS_BASE}knight.glb`, bytes: 370_000 }, { url: `${FIGHTERS_BASE}brute.glb`, bytes: 340_000 });
  return files;
}

/* Fetches one file, reporting bytes as they arrive. */
async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    onBytes(value.byteLength);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out.buffer;
}

/** Downloads the whole arena; `progress` gets the share done (0 … 1). */
export async function downloadArena(progress: (share: number) => void): Promise<ArenaFiles> {
  const manifest = arenaManifest();
  const expected = manifest.reduce((sum, f) => sum + f.bytes, 0);
  let received = 0;
  const tick = (n: number): void => {
    received += n;
    progress(Math.min(0.99, received / expected));
  };
  const get = (url: string): Promise<ArrayBuffer> => fetchWithProgress(url, tick);
  const shot = async (folder: string): Promise<ArenaShot> => {
    const base = `${ARENA_BASE}${folder}`;
    const meta = JSON.parse(new TextDecoder().decode(await get(`${base}arena.json`))) as ArenaMeta;
    const slices = meta.slices.map((_, i) => i);
    const [colour, sway, depth] = await Promise.all([
      Promise.all(slices.map(async (i) => new Blob([await get(`${base}tile${i}.webp`)], { type: "image/webp" }))),
      Promise.all(slices.map(async (i) => new Blob([await get(`${base}tile${i}.sway.png`)], { type: "image/png" }))),
      Promise.all(slices.map(async (i) => new Uint16Array(await get(`${base}tile${i}.depth.bin`)))),
    ]);
    return { meta, colour, sway, depth };
  };
  const [shots, probe, hero, knight, brute] = await Promise.all([
    Promise.all(SHOTS.map((s) => shot(s.folder))),
    get(`${ARENA_BASE}probe.hdr`),
    get(`${FIGHTERS_BASE}hero.glb`),
    get(`${FIGHTERS_BASE}knight.glb`),
    get(`${FIGHTERS_BASE}brute.glb`),
  ]);
  progress(1);
  return { meta: shots[0].meta, shots, probe, hero, knight, brute };
}

/** The ground height (m) at a distance along the fight line, from the exported profile. */
export function groundAt(meta: ArenaMeta, t: number): number {
  const g = meta.fight.ground;
  if (t <= g[0][0]) return g[0][1];
  for (let i = 1; i < g.length; i++) {
    if (t <= g[i][0]) {
      const [t0, h0] = g[i - 1];
      const [t1, h1] = g[i];
      return h0 + ((h1 - h0) * (t - t0)) / (t1 - t0);
    }
  }
  return g[g.length - 1][1];
}
