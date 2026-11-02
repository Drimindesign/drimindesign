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

/** Write small read-only markers without React updates in the simulation loop. */
export function writeRouteMap(root: HTMLElement, map: RouteMapSnapshot): void {
  const position = (element: HTMLElement, x: number): void => { element.style.left = `${routePercent(x, map.finish)}%`; };
  const queen = root.querySelector<HTMLElement>("[data-map-queen]");
  if (queen) position(queen, map.queenX);
  const progress = root.querySelector<HTMLElement>("[data-map-progress]");
  progress?.style.setProperty("--route-progress", String(routePercent(map.queenX, map.finish) / 100));
  root.querySelectorAll<HTMLElement>("[data-map-unit]").forEach((marker, index) => {
    const unit = map.units[index];
    marker.hidden = !unit;
    if (!unit) return;
    position(marker, unit.x);
    marker.dataset.state = unit.state;
    const label = `${unit.name}: ${Math.round(unit.x - map.queenX)} metres from queen, ${unit.state}`;
    marker.title = label;
    marker.setAttribute("aria-label", label);
  });
  const scale = root.querySelector<HTMLElement>("[data-map-scale]");
  if (scale) scale.textContent = `${Math.round(Math.max(0, Math.min(map.finish, map.queenX)))} / ${Math.ceil(map.finish)} m`;
}
