import { viewArrow as tune } from "@/lib/motion/tokens";

/** Sampled points along the arc (Web Animations interpolates linearly between them). */
const SAMPLES = 18;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/*
 * The View project arrow lifts off the link, floats over to the front panel on a soft arc
 * (turning to face where it's going, like a paper dart) and taps it just inside its
 * top-right corner, where the tissue pull pinches. A fixed-position clone flies, animating
 * only transform and opacity; the link's own arrow waits, hidden, and fades back in later.
 * Resolves at the moment of the tap.
 */
export async function flyArrow(arrow: HTMLElement, to: readonly [number, number]): Promise<void> {
  const box = arrow.getBoundingClientRect();
  const style = getComputedStyle(arrow);
  const clone = arrow.cloneNode(true) as HTMLElement;
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    display: "grid",
    placeItems: "center",
    font: style.font,
    color: style.color,
    // Legible over any project image it crosses.
    textShadow: "0 1px 2px rgb(0 0 0 / 0.35), 0 4px 14px rgb(0 0 0 / 0.3)",
    pointerEvents: "none",
    zIndex: "calc(var(--z-overlay) + 50)",
  });
  document.body.append(clone);
  arrow.style.opacity = "0";

  // The arc: from just above the link to the corner, bowing upward (perpendicular to the
  // straight line, on its upper side) by `arc` of the distance.
  const startY = -tune.liftPx;
  const dx = to[0] - (box.left + box.width / 2);
  const dy = to[1] - (box.top + box.height / 2) - startY;
  const distance = Math.hypot(dx, dy) || 1;
  const [nx, ny] = dx > 0 ? [dy / distance, -dx / distance] : [-dy / distance, dx / distance];
  const cx = dx / 2 + nx * distance * tune.arc;
  const cy = startY + dy / 2 + ny * distance * tune.arc;
  const at = (t: number): [number, number] => [
    2 * (1 - t) * t * cx + t * t * dx,
    (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cy + t * t * (startY + dy),
  ];
  const heading = (t: number): number => {
    const tx = 2 * (1 - t) * cx + 2 * t * (dx - cx);
    const ty = 2 * (1 - t) * (cy - startY) + 2 * t * (startY + dy - cy);
    return (Math.atan2(ty, tx) * 180) / Math.PI;
  };

  const total = tune.liftMs + tune.flightMs;
  const frames: Keyframe[] = [{ offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1)" }];
  let previous = heading(0);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = easeInOutCubic(i / SAMPLES);
    const [x, y] = at(t);
    // Unwrapped, so the turn never spins the long way round.
    let angle = heading(Math.min(t, 0.999));
    angle += Math.round((previous - angle) / 360) * 360;
    previous = angle;
    const scale = tune.liftScale - (tune.liftScale - 1.1) * t;
    frames.push({
      offset: (tune.liftMs + (i / SAMPLES) * tune.flightMs) / total,
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    });
  }
  // The lift-off eases out; the glide is already eased along the arc.
  frames[0].easing = "cubic-bezier(0.2, 0.8, 0.3, 1)";
  await clone.animate(frames, { duration: total, fill: "forwards" }).finished.catch(() => undefined);

  // The tap: pressed in and released, with a ripple on the panel where it lands.
  const [x, y] = at(1);
  const landed = frames[frames.length - 1].transform as string;
  const ripple = document.createElement("span");
  Object.assign(ripple.style, {
    position: "fixed",
    left: `${to[0] - 20}px`,
    top: `${to[1] - 20}px`,
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "2px solid rgb(255 255 255 / 0.9)",
    boxShadow: "0 0 18px rgb(255 255 255 / 0.45)",
    pointerEvents: "none",
    zIndex: "calc(var(--z-overlay) + 49)",
  });
  document.body.append(ripple);
  const pressed = landed.replace(/scale\([^)]*\)/, "scale(0.78)");
  const gone = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1.2)`;
  clone
    .animate([{ transform: landed }, { transform: pressed, offset: 0.35 }, { transform: gone, opacity: 0 }], { duration: tune.tapMs, fill: "forwards" })
    .finished.catch(() => undefined)
    .finally(() => clone.remove());
  ripple
    .animate([{ transform: "scale(0.3)", opacity: 0.9 }, { transform: "scale(1.8)", opacity: 0 }], {
      duration: tune.tapMs * 1.6,
      easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      fill: "forwards",
    })
    .finished.catch(() => undefined)
    .finally(() => ripple.remove());

  window.setTimeout(() => {
    arrow.style.opacity = "";
    arrow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }, tune.restoreMs);
  // The panel peels as the arrow presses in.
  await new Promise((resolve) => window.setTimeout(resolve, tune.tapMs * 0.35));
}
