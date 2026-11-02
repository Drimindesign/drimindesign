import type { Painter } from "../pixel/painter";

/** Draws the dropped key in projected canvas coordinates so it remains visible at every scale. */
export function drawDroppedPrisonKey(painter: Painter, x: number, groundY: number, shimmer: number): void {
  const y = groundY - 2.5 + Math.sin(shimmer * 2.5) * 0.35;
  painter.disc(x - 2, y, 2.2, "#ffd36b");
  painter.disc(x - 2, y, 0.9, "#27221b");
  painter.rect(x - 0.2, y - 0.5, 5, 1, "#ffd36b");
  painter.rect(x + 3.2, y + 0.3, 1, 1.2, "#ffd36b");
  painter.rect(x + 4.8, y + 0.3, 1, 1.2, "#ffd36b");
  if (Math.sin(shimmer * 4) > 0.88) {
    painter.px(x + 1.5, y - 3, "#fff1b0");
    painter.px(x + 4.5, y - 2.3, "#fff1b0");
  }
}

/** Adds a small timber dolly beneath the prison cage while it rolls toward interception. */
export function drawPrisonTransportDolly(painter: Painter, x: number, groundY: number): void {
  painter.rect(x - 8, groundY - 2.5, 16, 1.2, "#503b29");
  painter.rect(x - 6.8, groundY - 1.4, 1, 1, "#6d5135");
  painter.rect(x + 5.8, groundY - 1.4, 1, 1, "#6d5135");
  painter.disc(x - 5.6, groundY - 0.8, 1.8, "#29282a");
  painter.disc(x + 5.6, groundY - 0.8, 1.8, "#29282a");
  painter.disc(x - 5.6, groundY - 0.8, 0.55, "#c29b5d");
  painter.disc(x + 5.6, groundY - 0.8, 0.55, "#c29b5d");
}
