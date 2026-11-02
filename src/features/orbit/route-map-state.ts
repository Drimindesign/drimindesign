export type SquadOrderKind = "follow" | "hold" | "scout" | "regroup";
export interface SquadOrder { unit: number; kind: SquadOrderKind; x?: number }
export interface RouteMarker {
  id: number; name: string; x: number; upper: boolean; health: number;
  state: "moving" | "fighting" | "wounded" | "waiting";
}
export interface RouteMapSnapshot {
  finish: number; queenX: number; queenUpper: boolean;
  units: readonly RouteMarker[];
  upper: readonly { x0: number; x1: number }[];
  crossings: readonly { x: number; kind: "rope" | "gap" | "water" }[];
  objectives: readonly { x: number; label: string }[];
}

/** Shared x-coordinate projection keeps the ground and upper paths spatially aligned. */
export function routePercent(x: number, finish: number): number {
  return Math.max(0, Math.min(100, x / Math.max(1, finish) * 100));
}

/** Update preallocated marker nodes; React does not participate in simulation frames. */
export function writeRouteMap(root: HTMLElement, map: RouteMapSnapshot): void {
  const position = (element: HTMLElement, x: number, upper: boolean): void => {
    element.style.left = `${routePercent(x, map.finish)}%`;
    element.style.top = upper ? "24%" : "76%";
  };
  const queen = root.querySelector<HTMLElement>("[data-map-queen]");
  if (queen) position(queen, map.queenX, map.queenUpper);
  root.querySelectorAll<HTMLButtonElement>("[data-map-unit]").forEach((button, index) => {
    const unit = map.units[index];
    button.hidden = !unit;
    if (!unit) return;
    position(button, unit.x, unit.upper);
    button.dataset.unitId = String(unit.id);
    button.dataset.state = unit.state;
    button.dataset.name = unit.name;
    button.textContent = unit.name.slice(0, 2);
    const label = `${unit.name}: ${Math.round(unit.x - map.queenX)} metres from queen, ${unit.state}, ${Math.round(unit.health * 100)}% health`;
    button.title = label;
    button.setAttribute("aria-label", label);
  });
  root.querySelectorAll<HTMLOptionElement>("[data-map-option]").forEach((option, index) => {
    const unit = map.units[index]; option.hidden = !unit; option.disabled = !unit;
    if (unit) { option.value = String(unit.id); option.dataset.name = unit.name; option.textContent = `${unit.name} · ${Math.round(unit.x - map.queenX)}m · ${unit.state}`; }
  });
  const path = root.querySelector<SVGPathElement>("[data-map-upper]");
  path?.setAttribute("d", map.upper.map((s) => `M${routePercent(s.x0, map.finish) * 10},24 H${routePercent(s.x1, map.finish) * 10}`).join(" "));
  const crossings = root.querySelector<SVGPathElement>("[data-map-crossings]");
  crossings?.setAttribute("d", map.crossings.map((s) => { const x = routePercent(s.x, map.finish) * 10; return s.kind === "rope" ? `M${x},24 V76` : `M${x-3},68 l6,16 m-6,0 l6,-16`; }).join(" "));
  root.querySelectorAll<HTMLElement>("[data-map-objective]").forEach((node, index) => {
    const item = map.objectives[index]; node.hidden = !item;
    if (item) { position(node, item.x, false); node.title = item.label; node.setAttribute("aria-label", item.label); }
  });
  const range = root.querySelector<HTMLInputElement>("[data-map-destination]");
  if (range) range.max = String(Math.ceil(map.finish));
  const scale = root.querySelector<HTMLElement>("[data-map-scale]");
  if (scale) scale.textContent = `0–${Math.ceil(map.finish)} m · Queen ${Math.round(map.queenX)} m`;
}
