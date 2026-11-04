import type { Tactical } from "./stages/types";

/** Colour and letter for each teammate on the minimap. */
const ICON: Record<string, { color: string; letter: string }> = {
  knight: { color: "#7fb2ff", letter: "K" },
  barbarian: { color: "#e0a060", letter: "B" },
  mage: { color: "#c58bff", letter: "M" },
  ranger: { color: "#7ee08a", letter: "R" },
  rogue: { color: "#ff8fb8", letter: "S" },
  giant: { color: "#d8c27a", letter: "G" },
  dog: { color: "#c9c9c9", letter: "D" },
};

/*
 * The square minimap (top right): the ground around her as a line, her as a gold diamond, each
 * teammate as a lettered dot in its colour, enemies in red (bigger for the heavy ones), and a line
 * from each teammate to the enemy it's fighting. A downed teammate shows as a red cross.
 */
export function drawMinimap(canvas: HTMLCanvasElement, map: Tactical): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.round(canvas.clientWidth * dpr);
  if (size === 0) return;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = size / map.span;
  // Her at the middle, a little below centre; metres to pixels.
  const px = (x: number): number => size / 2 + (x - map.x) * s;
  const py = (y: number): number => size * 0.62 - (y - map.y) * s;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(8, 10, 18, 0.72)";
  ctx.fillRect(0, 0, size, size);
  // The ground.
  ctx.strokeStyle = "rgba(255, 246, 220, 0.35)";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  map.ground.forEach((h, i) => {
    const x = (i / (map.ground.length - 1)) * size;
    const y = py(h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // Who is fighting whom.
  ctx.strokeStyle = "rgba(255, 180, 71, 0.85)";
  ctx.lineWidth = 1 * dpr;
  for (const m of map.mates) {
    const f = m.fight === null ? undefined : map.foes[m.fight];
    if (!f) continue;
    ctx.beginPath();
    ctx.moveTo(px(m.x), py(m.y + 0.8));
    ctx.lineTo(px(f.x), py(f.y + 0.8));
    ctx.stroke();
  }
  // Enemies.
  for (const f of map.foes) {
    ctx.fillStyle = "#ff4b4b";
    ctx.beginPath();
    ctx.arc(px(f.x), py(f.y + 0.8), (f.big ? 4 : 2.6) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  // The team.
  ctx.font = `700 ${7 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const m of map.mates) {
    const x = px(m.x);
    const y = py(m.y + 0.8);
    if (m.down) {
      ctx.strokeStyle = "#ff6974";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x - 3 * dpr, y - 3 * dpr);
      ctx.lineTo(x + 3 * dpr, y + 3 * dpr);
      ctx.moveTo(x + 3 * dpr, y - 3 * dpr);
      ctx.lineTo(x - 3 * dpr, y + 3 * dpr);
      ctx.stroke();
      continue;
    }
    const icon = ICON[m.kind] ?? { color: "#a9d9ca", letter: "?" };
    ctx.fillStyle = icon.color;
    ctx.beginPath();
    ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0d14";
    ctx.fillText(icon.letter, x, y + 0.5 * dpr);
  }
  // Her.
  const hx = px(map.x);
  const hy = py(map.y + 0.8);
  ctx.fillStyle = "#f5c773";
  ctx.beginPath();
  ctx.moveTo(hx, hy - 6 * dpr);
  ctx.lineTo(hx + 5 * dpr, hy);
  ctx.lineTo(hx, hy + 6 * dpr);
  ctx.lineTo(hx - 5 * dpr, hy);
  ctx.closePath();
  ctx.fill();
}
