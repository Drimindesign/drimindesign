import { storyTree } from "@/lib/motion/tokens";
import { retryImport } from "@/lib/utils/retry-import";

/*
 * Unpacks the generated tree into typed arrays. Every node and leaf carries its baked birth
 * (the growth value 0…1 at which it appears); TIERS holds each tier's [start, end].
 */

export interface TreeNodes {
  count: number;
  x: Float32Array;
  y: Float32Array;
  parent: Int32Array;
  /** Growth (0…1) at which this node is reached by its growing tip. */
  bornAt: Float32Array;
  radius: Float32Array;
}

export interface TreeLeaves {
  count: number;
  node: Int32Array;
  angle: Float32Array;
  size: Float32Array;
  color: Uint8Array;
  bornAt: Float32Array;
}

export interface TreeModel {
  base: { x: number; y: number };
  branches: TreeNodes;
  roots: TreeNodes;
  leaves: TreeLeaves;
  /** Milestone node per tier, bottom to top. */
  anchors: number[];
  /** [start, end] growth of each tier; a milestone is reached at its tier's end. */
  tiers: (readonly [number, number])[];
}

function unpackNodes(packed: readonly number[]): TreeNodes {
  const count = packed.length / 5;
  const nodes: TreeNodes = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    parent: new Int32Array(count),
    bornAt: new Float32Array(count),
    radius: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    nodes.x[i] = packed[i * 5];
    nodes.y[i] = packed[i * 5 + 1];
    nodes.parent[i] = packed[i * 5 + 2];
    nodes.bornAt[i] = packed[i * 5 + 3];
    nodes.radius[i] = packed[i * 5 + 4];
  }
  return nodes;
}

/** The generated tree data: its own chunk, fetched early (warmUp) and loaded when near. */
export const loadTreeData = (): Promise<typeof import("./data/tree.generated")> => retryImport(() => import("./data/tree.generated"));

export async function loadTreeModel(): Promise<TreeModel> {
  const data = await loadTreeData();
  const count = data.LEAVES.length / 5;
  const leaves: TreeLeaves = {
    count,
    node: new Int32Array(count),
    angle: new Float32Array(count),
    size: new Float32Array(count),
    color: new Uint8Array(count),
    bornAt: new Float32Array(count),
  };
  for (let i = 0; i < count; i++) {
    leaves.node[i] = data.LEAVES[i * 5];
    leaves.angle[i] = data.LEAVES[i * 5 + 1];
    leaves.size[i] = data.LEAVES[i * 5 + 2];
    leaves.color[i] = data.LEAVES[i * 5 + 3];
    leaves.bornAt[i] = data.LEAVES[i * 5 + 4];
  }
  return {
    base: data.TREE_BASE,
    branches: unpackNodes(data.BRANCHES),
    roots: unpackNodes(data.ROOTS),
    leaves,
    anchors: [...data.ANCHORS],
    tiers: [...data.TIERS],
  };
}

/** 0…1 progress of something that starts at `start` and takes `duration` of growth. */
export function stageOf(growth: number, start: number, duration: number): number {
  return Math.min(1, Math.max(0, (growth - start) / duration));
}

/** Growth reached while the ring section lifts away (the seed pops in). */
const SEED_GROWTH = 0.04;
/** The section starts one screen early, pinned under the ring section, which lifts off it. */
export const REVEAL_VH = 1;

/*
 * Growth target from scroll (the section's top, which is already pinned while the ring
 * section above lifts away): the seed pops in during the reveal, then growth follows.
 */
export function growthFromScroll(sectionTop: number, viewport: number): number {
  const scrolled = -sectionTop / viewport;
  if (scrolled <= 0) return 0;
  if (scrolled < REVEAL_VH) return SEED_GROWTH * (scrolled / REVEAL_VH);
  return SEED_GROWTH + (1 - SEED_GROWTH) * Math.min(1, (scrolled - REVEAL_VH) / storyTree.growVh);
}

/** Inverse of growthFromScroll after the reveal: scroll offset from the section top, in viewport heights. */
export function scrollForGrowth(growth: number): number {
  return REVEAL_VH + ((growth - SEED_GROWTH) / (1 - SEED_GROWTH)) * storyTree.growVh;
}
