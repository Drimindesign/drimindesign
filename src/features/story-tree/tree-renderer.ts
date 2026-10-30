import { storyTree } from "@/lib/motion/tokens";
import { stageOf, type TreeModel, type TreeNodes } from "./tree-model";

/*
 * Draws the growing tree on a 2D canvas, in tree units (a 1000 × 1000 box, y down) mapped
 * to the screen by `layout`. Per frame and per node:
 *   - a branch extends from its parent toward itself as growth passes through its window;
 *   - it starts thin and thickens to full girth over `maturity` (trees widen with age);
 *   - a breeze moves it from the first sprout: high, thin twigs most, the trunk not at all,
 *     in slow gusts rather than a metronome;
 *   - a milestone sends a short, decaying tremor up the tree;
 *   - leaves unfold with a little overshoot and flutter.
 * The "magic" is deliberately faint: tiny warm motes drifting up from the growing tips and
 * a soft halo on each tip, a percent or two of the frame at most.
 */

export interface TreeLayout {
  /** Screen pixels per tree unit. */
  scale: number;
  /** Screen position of tree point (0, 0), CSS pixels. */
  offsetX: number;
  offsetY: number;
}

export interface Leader {
  /** Branch node the label belongs to. */
  node: number;
  /** Label edge in CSS pixels. */
  toX: number;
  toY: number;
  /** 0…1 drawing progress. */
  progress: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
}

const BARK_THIN = [92, 66, 50];
const BARK_THICK = [38, 27, 21];
const BARK_STEPS = 12;
/* Roots fade out with depth into the white page: there is no ground, only a hint of them. */
const ROOT_RGB = "74, 54, 43";
const ROOT_FADE_DEPTH = 70;
/* Young → mature greens, then two brand purples (a few leaves turn to the brand at the end). */
const LEAF_COLORS = ["#7e9e55", "#5f7f40", "#94b06a", "#46663a", "#4c1d95", "#8a5ad8"];
const MOTE_COLOR = "150, 110, 230";
const MAX_MOTES = 140;

function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ")})`;
}

const barkColors = Array.from({ length: BARK_STEPS }, (_, i) => mix(BARK_THIN, BARK_THICK, i / (BARK_STEPS - 1)));

/* A pointed leaf `s` long at (x, y), turned by (cos, sin): two arcs meeting at the tips. */
function leafShape(path: CanvasPath, x: number, y: number, s: number, cos: number, sin: number): void {
  const ax = cos * s * 0.5;
  const ay = sin * s * 0.5;
  const bx = -sin * s * 0.36;
  const by = cos * s * 0.36;
  path.moveTo(x - ax, y - ay);
  path.quadraticCurveTo(x - bx, y - by, x + ax, y + ay);
  path.quadraticCurveTo(x + bx, y + by, x - ax, y - ay);
}

function easeOutBack(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

export class TreeRenderer {
  private context: CanvasRenderingContext2D;
  private layout: TreeLayout = { scale: 1, offsetX: 0, offsetY: 0 };
  private dpr = 1;
  private width = 0;
  private height = 0;
  private sway: Float32Array;
  private motes: Mote[] = [];
  private lastGrowth = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly model: TreeModel,
    private readonly maxMotes = MAX_MOTES,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    this.context = context;
    this.sway = new Float32Array(model.branches.count);
  }

  resize(width: number, height: number, dpr: number, layout: TreeLayout): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.layout = layout;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  /** Screen position (CSS px) of a branch node, including its current sway. */
  nodeToScreen(node: number): [number, number] {
    const { scale, offsetX, offsetY } = this.layout;
    const b = this.model.branches;
    return [offsetX + (b.x[node] + this.sway[node]) * scale, offsetY + b.y[node] * scale];
  }

  /** `tremor` (tree units) is the current milestone quiver amplitude at the top of the tree. */
  render(growth: number, time: number, dt: number, leaders: readonly Leader[], shimmer: boolean, tremor: number): void {
    const ctx = this.context;
    const { scale, offsetX, offsetY } = this.layout;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * scale, 0, 0, this.dpr * scale, this.dpr * offsetX, this.dpr * offsetY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.updateSway(growth, time, tremor);
    this.drawSeed(growth);
    this.drawNodes(this.model.roots, growth, null, true);
    const tips = this.drawNodes(this.model.branches, growth, this.sway, false);
    this.drawLeaves(growth, time);
    if (shimmer) this.drawShimmer(tips, growth, dt);

    // Leader lines are drawn in screen space, so they stay hairline at any scale.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLeaders(leaders);
    this.lastGrowth = growth;
  }

  private updateSway(growth: number, time: number, tremor: number): void {
    const b = this.model.branches;
    const base = this.model.base.y;
    const omega = (Math.PI * 2) / storyTree.swayPeriod;
    // Gusts: the breeze swells and settles on two slow, unrelated cycles.
    const gust = 0.55 + 0.45 * Math.sin(time * 0.31) * Math.sin(time * 0.53 + 1.1);
    const quiver = tremor * Math.sin(time * Math.PI * 2 * storyTree.tremorHz);
    const breeze = stageOf(growth, 0.02, 0.08);
    for (let i = 0; i < b.count; i++) {
      const height = Math.min(1, Math.max(0, (base - b.y[i]) / 640));
      // Thin twigs give more to the wind than limbs of the same height.
      const give = height * height * (1 + 0.9 / (1 + b.radius[i]));
      const wave =
        Math.sin(omega * time + b.x[i] * 0.004) + 0.3 * Math.sin(omega * 2.7 * time + b.y[i] * 0.012 + b.x[i] * 0.003);
      this.sway[i] = breeze * storyTree.swayAmount * gust * give * wave + quiver * height;
    }
  }

  private drawSeed(growth: number): void {
    const [start, end] = storyTree.seed;
    const appear = stageOf(growth, start, end - start);
    // The seed is swallowed by the trunk as it thickens.
    const fade = 1 - stageOf(growth, 0.14, 0.08);
    if (appear <= 0 || fade <= 0) return;
    const ctx = this.context;
    const { x, y } = this.model.base;
    const s = easeOutBack(appear);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = barkColors[BARK_STEPS - 1];
    ctx.beginPath();
    ctx.ellipse(x, y - 4 * s, 6 * s, 8.5 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draws grown and growing segments; returns the growing tips (tree units). */
  private drawNodes(nodes: TreeNodes, growth: number, sway: Float32Array | null, isRoot: boolean): number[] {
    const ctx = this.context;
    const tips: number[] = [];
    const baseY = this.model.base.y;
    for (let i = 0; i < nodes.count; i++) {
      const p = nodes.parent[i];
      if (p < 0) continue;
      const span = Math.max(1e-4, nodes.bornAt[i] - nodes.bornAt[p]);
      const f = stageOf(growth, nodes.bornAt[p], span);
      if (f <= 0) continue;
      const px = nodes.x[p] + (sway ? sway[p] : 0);
      const py = nodes.y[p];
      const nx = nodes.x[i] + (sway ? sway[i] : 0);
      const ny = nodes.y[i];
      const x = px + (nx - px) * f;
      const y = py + (ny - py) * f;
      const maturity = stageOf(growth, nodes.bornAt[i] - span, storyTree.maturity) ** 0.7;
      const radius = Math.max(0.45, nodes.radius[i] * (0.22 + 0.78 * maturity));
      if (isRoot) {
        const depth = Math.min(1, Math.max(0, (Math.max(py, y) - baseY) / ROOT_FADE_DEPTH));
        ctx.strokeStyle = `rgba(${ROOT_RGB}, ${(0.85 * (1 - depth) ** 1.4).toFixed(3)})`;
      } else {
        ctx.strokeStyle = barkColors[Math.min(BARK_STEPS - 1, Math.round((radius / 7) * (BARK_STEPS - 1)))];
      }
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (f < 1) tips.push(x, y);
    }
    return tips;
  }

  private drawLeaves(growth: number, time: number): void {
    const ctx = this.context;
    const leaves = this.model.leaves;
    const b = this.model.branches;
    // Open leaves go into one path per colour (a handful of fills for the whole crown); only
    // the ones still unfolding, which fade in, are filled one by one.
    const open = LEAF_COLORS.map(() => new Path2D());
    for (let i = 0; i < leaves.count; i++) {
      const unfold = stageOf(growth, leaves.bornAt[i], 0.05);
      if (unfold <= 0) continue;
      const node = leaves.node[i];
      const s = easeOutBack(unfold) * leaves.size[i];
      // Leaves flutter in the same breeze as the branches.
      const angle = leaves.angle[i] + 0.12 * Math.sin(time * 1.6 + i * 1.7);
      const x = b.x[node] + this.sway[node] + Math.cos(leaves.angle[i]) * s * 0.55;
      const y = b.y[node] + Math.sin(leaves.angle[i]) * s * 0.55;
      const fade = Math.min(1, unfold * 1.6);
      if (fade >= 1) {
        leafShape(open[leaves.color[i]], x, y, s, Math.cos(angle), Math.sin(angle));
        continue;
      }
      ctx.globalAlpha = 0.94 * fade;
      ctx.fillStyle = LEAF_COLORS[leaves.color[i]];
      ctx.beginPath();
      leafShape(ctx, x, y, s, Math.cos(angle), Math.sin(angle));
      ctx.fill();
    }
    ctx.globalAlpha = 0.94;
    open.forEach((path, color) => {
      ctx.fillStyle = LEAF_COLORS[color];
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
  }

  private drawShimmer(tips: number[], growth: number, dt: number): void {
    const ctx = this.context;
    const growing = growth - this.lastGrowth;

    // Spawn: while growing, from the tips; once grown, a rare mote near the crown.
    if (growing > 0 && tips.length > 0) {
      const spawn = Math.min(4, Math.ceil(growing * 900));
      for (let k = 0; k < spawn && this.motes.length < this.maxMotes; k++) {
        const t = Math.floor(Math.random() * (tips.length / 2)) * 2;
        this.spawnMote(tips[t], tips[t + 1]);
      }
    } else if (growth > 0.95 && Math.random() < dt * 1.5 && this.motes.length < this.maxMotes) {
      const node = Math.floor(Math.random() * this.model.branches.count);
      this.spawnMote(this.model.branches.x[node], this.model.branches.y[node]);
    }

    // A faint halo on a few growing tips.
    for (let t = 0; t < Math.min(tips.length, 24); t += 2) {
      const halo = ctx.createRadialGradient(tips[t], tips[t + 1], 0, tips[t], tips[t + 1], 16);
      halo.addColorStop(0, `rgba(${MOTE_COLOR}, 0.035)`);
      halo.addColorStop(1, `rgba(${MOTE_COLOR}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(tips[t] - 16, tips[t + 1] - 16, 32, 32);
    }

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.age += dt;
      if (m.age >= m.life) {
        this.motes.splice(i, 1);
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx += Math.sin(m.age * 2 + i) * 4 * dt;
      const life = m.age / m.life;
      const alpha = 0.15 * Math.sin(Math.PI * life);
      ctx.fillStyle = `rgba(${MOTE_COLOR}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private spawnMote(x: number, y: number): void {
    this.motes.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 14,
      vy: -(10 + Math.random() * 22),
      life: 1.4 + Math.random() * 1.6,
      age: 0,
      size: 0.8 + Math.random() * 1.4,
    });
  }

  private drawLeaders(leaders: readonly Leader[]): void {
    const ctx = this.context;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(10, 10, 10, 0.22)";
    for (const leader of leaders) {
      if (leader.progress <= 0) continue;
      const [x, y] = this.nodeToScreen(leader.node);
      const ex = x + (leader.toX - x) * leader.progress;
      const ey = y + (leader.toY - y) * leader.progress;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = "rgba(61, 22, 120, 0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
