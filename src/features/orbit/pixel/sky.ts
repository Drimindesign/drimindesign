import { random } from "../engine/noise";
import { smoothstep } from "../engine/noise";
import type { Painter } from "./painter";

/*
 * The climb out of the atmosphere, drawn around the camera's altitude: the evening sky deepens
 * to black, stars come out, Earth below turns from a flat horizon into a curved planet with a
 * thin glowing atmosphere. Sky and atmosphere are smooth gradients (light); stars and the
 * planet's surface are pixels.
 */

interface Star {
  x: number;
  y: number;
  bright: boolean;
}

/** Sky colours at the ground and in space, top and bottom of the view. */
const GROUND_TOP: [number, number, number] = [19, 22, 44];
const GROUND_BOTTOM: [number, number, number] = [154, 85, 96];
const SPACE: [number, number, number] = [3, 4, 10];

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export class Sky {
  private stars: Star[] = [];
  private width = 0;
  private height = 0;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const rand = random(91);
    this.stars = Array.from({ length: Math.round((width * height) / 900) }, () => ({ x: rand() * width, y: rand() * height, bright: rand() < 0.12 }));
  }

  /** `altitude` m; `space` 0 … 1 how far into space the camera is. */
  draw(ctx: CanvasRenderingContext2D, painter: Painter, altitude: number, space: number, time: number): void {
    const { width: w, height: h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix(GROUND_TOP, SPACE, smoothstep(0, 0.6, space)));
    g.addColorStop(1, mix(GROUND_BOTTOM, SPACE, smoothstep(0.1, 0.9, space)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const shown = 0.25 + space * 0.75;
    for (const [i, star] of this.stars.entries()) {
      if ((i % 100) / 100 > shown) continue;
      // Stars drift down slowly as you climb.
      const y = (star.y + altitude * 0.4) % h;
      const twinkle = star.bright && Math.sin(time * 3 + i) > 0.6;
      painter.px(star.x, y, twinkle || star.bright ? "#ffffff" : "#9aa3c7");
    }

    // Earth curving away below once you are high enough.
    const curve = smoothstep(0.25, 1, space);
    if (curve <= 0) return;
    const radius = w * (6 - 4.6 * curve);
    const cap = h * (0.06 + 0.22 * curve);
    const cx = w / 2;
    const cy = h - cap + radius;
    const atmosphere = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius + 14);
    atmosphere.addColorStop(0, "rgba(120, 190, 255, 0.55)");
    atmosphere.addColorStop(1, "rgba(120, 190, 255, 0)");
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 14, 0, Math.PI * 2);
    ctx.fill();
    const surface = ctx.createLinearGradient(0, h - cap, 0, h);
    surface.addColorStop(0, "#3f7fc8");
    surface.addColorStop(1, "#173462");
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // Continents and cloud bands, in pixels, scrolling slowly as the planet turns.
    const rand = random(5);
    for (let i = 0; i < 26; i++) {
      const x = ((rand() * w * 1.4 - time * 2) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * 0.2;
      const top = cy - Math.sqrt(Math.max(0, radius * radius - (x - cx) ** 2));
      const y = top + 3 + rand() * cap;
      if (y > h) continue;
      const land = i % 3 !== 0;
      painter.rect(x, y, 6 + rand() * 22, 1 + rand() * 3, land ? "#4f8a4a" : "#e8f2ff");
    }
  }
}
