/*
 * Generates the story tree (src/features/story-tree/data/tree.generated.ts) at build time.
 *
 * Branches and roots grow by space colonisation: a cloud of attraction points fills the
 * crown (or the root zone); tips grow step by step toward the points near them, and points
 * are consumed when reached. The result branches unevenly and organically, never
 * symmetrical. A fixed seed makes the tree identical on every build.
 *
 * The crown is a triangle with a single leader running up the middle to the peak: a wide,
 * established base narrowing to one direction, the way the studio grew. Growth is told in
 * tiers, bottom to top, one per milestone: the leader climbs through a tier, that tier's
 * branches grow out, the milestone lands, a short pause, then the next tier. Each node's
 * "birth" is that baked growth time (0…1); TIERS holds each tier's [start, end].
 * Radii follow the pipe model (a branch is as thick as its children combined).
 *
 * Coordinates: a 1000 × 1000 box, y down, the seed at (500, BASE_Y).
 * Usage: node scripts/generate-tree.ts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUTPUT = fileURLToPath(new URL("../src/features/story-tree/data/tree.generated.ts", import.meta.url));
const SEED = 20260426;
const BASE_X = 500;
const BASE_Y = 760;

interface Node {
  x: number;
  y: number;
  parent: number;
  dist: number;
  radius: number;
  children: number[];
}

interface ColonyOptions {
  attractors: [number, number][];
  start: [number, number];
  direction: [number, number];
  /** How far a point attracts tips. */
  influence: number;
  /** Points closer than this to a tip are consumed. */
  kill: number;
  step: number;
  /** Straight growth before the first attractor is in range. */
  trunkLength: number;
  maxIterations: number;
}

/* Seeded PRNG (mulberry32), so every build makes the same tree. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = random(SEED);
const between = (min: number, max: number): number => min + rand() * (max - min);

/*
 * Points inside a triangle, apex up, with a softly irregular outline (sampled evenly by
 * area), plus a seam of points up the middle that draws one leader to the peak.
 */
const APEX = { x: 500, y: 95 };
const CROWN_BASE_Y = 610;
const CROWN_HALF_WIDTH = 330;

function crownAttractors(count: number): [number, number][] {
  const points: [number, number][] = [];
  while (points.length < count) {
    const t = Math.sqrt(rand()); // 0 at the apex, 1 at the base; sqrt = even density by area
    const y = APEX.y + t * (CROWN_BASE_Y - APEX.y);
    const wobble = 1 + 0.08 * Math.sin(y * 0.045) + 0.05 * Math.sin(y * 0.11 + 1.3);
    const half = CROWN_HALF_WIDTH * t * wobble;
    points.push([APEX.x + between(-half, half), y]);
  }
  for (let y = APEX.y + 8; y < CROWN_BASE_Y; y += 14) points.push([APEX.x + between(-5, 5), y]);
  return points;
}

/* Points in a wide, shallow band just under the seed: roots spread, they don't dig. */
function rootAttractors(count: number): [number, number][] {
  const points: [number, number][] = [];
  while (points.length < count) {
    const angle = between(0.28, Math.PI - 0.28);
    const r = Math.sqrt(rand());
    points.push([BASE_X + Math.cos(angle) * r * 220, BASE_Y + 6 + Math.sin(angle) * r * 78]);
  }
  return points;
}

function colonise(options: ColonyOptions): Node[] {
  const { influence, kill, step } = options;
  const nodes: Node[] = [{ x: options.start[0], y: options.start[1], parent: -1, dist: 0, radius: 0, children: [] }];
  const attractors = options.attractors.slice();

  const addNode = (parent: number, dx: number, dy: number): void => {
    const p = nodes[parent];
    // A tip pulled from opposite sides would otherwise sprout again and again on the same
    // spot, piling up overlapping twigs (and inflating the pipe-model thickness).
    if (p.children.length >= 3) return;
    const length = Math.hypot(dx, dy) || 1;
    // A little wander, so straight runs never look ruled.
    const jitter = between(-0.12, 0.12);
    const ux = dx / length + jitter * (-dy / length);
    const uy = dy / length + jitter * (dx / length);
    const ul = Math.hypot(ux, uy);
    const x = p.x + (ux / ul) * step;
    const y = p.y + (uy / ul) * step;
    if (p.children.some((c) => Math.hypot(nodes[c].x - x, nodes[c].y - y) < step * 0.6)) return;
    nodes.push({ x, y, parent, dist: p.dist + step, radius: 0, children: [] });
    p.children.push(nodes.length - 1);
  };

  // The trunk (or tap root) grows straight until the attractors are in reach.
  for (let i = 0; i < options.trunkLength / step; i++) addNode(nodes.length - 1, ...options.direction);

  for (let iteration = 0; iteration < options.maxIterations && attractors.length > 0; iteration++) {
    const pull = new Map<number, [number, number]>();
    for (const [ax, ay] of attractors) {
      let best = -1;
      let bestDistance = influence;
      nodes.forEach((node, index) => {
        const d = Math.hypot(ax - node.x, ay - node.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      if (best < 0) continue;
      const node = nodes[best];
      const d = bestDistance || 1;
      const sum = pull.get(best) ?? [0, 0];
      pull.set(best, [sum[0] + (ax - node.x) / d, sum[1] + (ay - node.y) / d]);
    }
    if (pull.size === 0) break;
    for (const [index, [dx, dy]] of pull) addNode(index, dx, dy);
    for (let i = attractors.length - 1; i >= 0; i--) {
      const [ax, ay] = attractors[i];
      if (nodes.some((node) => Math.hypot(ax - node.x, ay - node.y) < kill)) attractors.splice(i, 1);
    }
  }
  return nodes;
}

/* Pipe model: twigs start at `tip`, a parent's area is the sum of its children's. */
function assignRadii(nodes: Node[], tip: number, exponent: number): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    node.radius =
      node.children.length === 0
        ? tip
        : Math.pow(node.children.reduce((sum, c) => sum + Math.pow(nodes[c].radius, exponent), 0), 1 / exponent);
  }
}

/* Laplacian smoothing on unbranched runs: softens the step-by-step zigzag into curves. */
function smooth(nodes: Node[], passes: number): void {
  for (let pass = 0; pass < passes; pass++) {
    const next = nodes.map((node) => ({ x: node.x, y: node.y }));
    nodes.forEach((node, index) => {
      if (node.parent < 0 || node.children.length !== 1) return;
      const a = nodes[node.parent];
      const b = nodes[node.children[0]];
      next[index].x = (a.x + node.x * 2 + b.x) / 4;
      next[index].y = (a.y + node.y * 2 + b.y) / 4;
    });
    nodes.forEach((node, index) => {
      node.x = next[index].x;
      node.y = next[index].y;
    });
  }
}

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;

function pack(nodes: Node[], births: number[], radiusScale: number): number[] {
  return nodes.flatMap((node, index) => [
    round(node.x),
    round(node.y),
    node.parent,
    round(births[index], 4),
    round(node.radius * radiusScale, 2),
  ]);
}

/* --- Tree and roots ------------------------------------------------------------------- */

const branches = colonise({
  attractors: crownAttractors(1600),
  start: [BASE_X, BASE_Y],
  direction: [0, -1],
  influence: 70,
  kill: 15,
  step: 8,
  trunkLength: 110,
  maxIterations: 500,
});
smooth(branches, 3);
// Exponent 2 = da Vinci's rule (cross-sections add up): fine twigs, a sturdy trunk.
assignRadii(branches, 1, 2.05);
const branchScale = 16 / branches[0].radius;

const roots = colonise({
  // Few, far-reaching attractors make a handful of long, curving roots, not a comb of stubs.
  attractors: rootAttractors(55),
  start: [BASE_X, BASE_Y],
  direction: [0, 1],
  influence: 110,
  kill: 9,
  step: 7,
  trunkLength: 6,
  maxIterations: 200,
});
smooth(roots, 3);
assignRadii(roots, 1, 2.1);
// Roots start as wide as the trunk's base, so the trunk flares into them.
const rootScale = 12 / roots[0].radius;

/* --- Growth timeline: tiers, bottom to top ---------------------------------------------- */

/** Tier boundaries as fractions of the leader's height (the first includes the bare trunk). */
const TIER_EDGES = [0, 0.4, 0.55, 0.67, 0.78, 0.89, 1.0001];
const TIER_COUNT = TIER_EDGES.length - 1;
const START = 0.07;
const GROW = 0.105;
const PAUSE = 0.035;
const tiers = Array.from({ length: TIER_COUNT }, (_, k) => {
  const start = START + k * (GROW + PAUSE);
  return [round(start, 4), round(start + GROW, 4)] as [number, number];
});

// The leader: the path from the seed to the highest node.
const apexIndex = branches.reduce((best, node, index) => (node.y < branches[best].y ? index : best), 0);
const isLeader = branches.map(() => false);
for (let i = apexIndex; i >= 0; i = branches[i].parent) isLeader[i] = true;

const heightOf = (node: Node): number => (BASE_Y - node.y) / (BASE_Y - branches[apexIndex].y);
const tierOfHeight = (h: number): number => {
  for (let k = 0; k < TIER_COUNT; k++) if (h < TIER_EDGES[k + 1]) return k;
  return TIER_COUNT - 1;
};
const tierOf = branches.map((node) => tierOfHeight(heightOf(node)));

// A clear central stem: the leader tapers steadily to the peak instead of thinning to a
// twig at the first fork (raw radius units; tips are 1).
const trunkRaw = branches[0].radius;
branches.forEach((node, index) => {
  if (isLeader[index]) node.radius = Math.max(node.radius, 1 + (trunkRaw - 1) * (1 - heightOf(node)) ** 1.3);
});

/*
 * A rising growth front: within a tier, a node appears as the front passes its height
 * (and a little later the further it is from the centre, so limbs reach outward), never
 * before its parent. The pause between tiers is where the milestone lands.
 */
const births = branches.map(() => 0);
branches.forEach((node, index) => {
  const k = tierOf[index];
  const band = (heightOf(node) - TIER_EDGES[k]) / (TIER_EDGES[k + 1] - TIER_EDGES[k]);
  const outward = Math.min(1, Math.abs(node.x - BASE_X) / CROWN_HALF_WIDTH);
  const front = tiers[k][0] + Math.min(1, Math.max(0, band) * 0.65 + outward * 0.35) * GROW;
  const afterParent = node.parent >= 0 ? births[node.parent] + 0.0015 : 0;
  births[index] = Math.min(tiers[k][1], Math.max(front, afterParent));
});

// Roots spread while the seed opens, before the trunk.
const rootMaxDist = Math.max(...roots.map((node) => node.dist));
const rootBirths = roots.map((node) => 0.02 + (node.dist / rootMaxDist) * 0.06);

/* Leaves on thin twigs, opening shortly after their twig, before the next tier starts. */
const leaves: number[] = [];
branches.forEach((node, index) => {
  // Thin = only a few twigs' worth of wood beyond this point (tips have radius 1).
  if (node.radius >= 2.6 || isLeader[index]) return;
  const count = node.children.length === 0 ? 4 : rand() < 0.3 ? 1 : 0;
  const k = tierOf[index];
  const latest = k === TIER_COUNT - 1 ? 0.97 : tiers[k][1] + PAUSE * 0.6;
  for (let i = 0; i < count; i++) {
    const orange = rand() < 0.12;
    leaves.push(
      index,
      round(between(-Math.PI, Math.PI), 2),
      round(between(8, 14)),
      orange ? 4 + Math.floor(rand() * 2) : Math.floor(rand() * 4),
      round(Math.min(latest, births[index] + 0.015 + rand() * 0.03), 4),
    );
  }
});

/*
 * One milestone anchor per tier: a sturdy branch point among the last to finish in its tier,
 * alternating sides. The top tier ("Today") is the peak itself.
 */
function pickAnchors(): number[] {
  return tiers.map(([, end], k) => {
    if (k === TIER_COUNT - 1) return apexIndex;
    const side = k % 2 === 0 ? -1 : 1;
    const candidates = branches
      .map((node, index) => ({ node, index }))
      .filter(({ node, index }) => {
        const r = node.radius * branchScale;
        return tierOf[index] === k && !isLeader[index] && r > 0.9 && r < 4.5 && Math.sign(node.x - BASE_X) === side;
      });
    const score = ({ node, index }: { node: Node; index: number }): number =>
      Math.abs(births[index] - (end - 0.015)) * 8 - Math.abs(node.x - BASE_X) / 1000;
    return candidates.sort((a, b) => score(a) - score(b))[0]?.index ?? apexIndex;
  });
}

const anchors = pickAnchors();

const file = `// Generated by scripts/generate-tree.ts (seed ${SEED}). Do not edit by hand.
// Nodes are packed as [x, y, parent, birth (growth 0…1), radius] in a 1000 × 1000 box (y down).
// Leaves are packed as [node, angle, size, colour index, birth (growth 0…1)].
// TIERS: [start, end] growth of each tier, bottom to top; ANCHORS: milestone node per tier.

export const TREE_BASE = { x: ${BASE_X}, y: ${BASE_Y} } as const;
export const TIERS: readonly (readonly [number, number])[] = ${JSON.stringify(tiers)};
export const BRANCHES: readonly number[] = ${JSON.stringify(pack(branches, births, branchScale))};
export const ROOTS: readonly number[] = ${JSON.stringify(pack(roots, rootBirths, rootScale))};
export const LEAVES: readonly number[] = ${JSON.stringify(leaves)};
export const ANCHORS: readonly number[] = ${JSON.stringify(anchors)};
`;

writeFileSync(OUTPUT, file);
console.log(
  `tree: ${branches.length} branch nodes, ${roots.length} root nodes, ${leaves.length / 5} leaves; ` +
    `tiers ${JSON.stringify(tiers)}; anchors ${anchors.join(",")}`,
);
