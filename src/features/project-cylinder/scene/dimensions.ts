import { BufferAttribute, PlaneGeometry } from "three";

/*
 * Ring proportions (world units; a standing figure is ~1.3). A thin, open band of panels
 * standing upright: no caps, no thickness, wider than it is tall, like a panoramic screen
 * bent into a circle. Panels are 7:5 and the radius follows from fitting them edge to edge.
 */
export const PANEL_WIDTH = 4;
export const PANEL_ASPECT = 7 / 5;
export const PANEL_HEIGHT = PANEL_WIDTH / PANEL_ASPECT;
/** Hairline seam between panels along the circumference. */
export const PANEL_GAP = 0.035;
/** The band stands directly on the floor. */
export const RING_BASE = 0;
export const RING_MID_Y = RING_BASE + PANEL_HEIGHT / 2;

export interface RingDimensions {
  panels: number;
  radius: number;
  /** Angle between neighbouring panel centres. */
  step: number;
}

export function ringDimensions(projects: number): RingDimensions {
  // At least 8 panels (projects repeat around the ring), so the band keeps its proportions.
  const panels = Math.max(projects, 8);
  return {
    panels,
    radius: (panels * (PANEL_WIDTH + PANEL_GAP)) / (2 * Math.PI),
    step: (2 * Math.PI) / panels,
  };
}

/*
 * A panel bent around the vertical axis, centred on +Z (facing out). Built from a
 * PlaneGeometry so UVs stay plane-like and the image isn't stretched; `segments` columns
 * along the arc keep the curve smooth. Front faces point outward, back faces inward.
 */
export function bentPanelGeometry(radius: number, segments: number): PlaneGeometry {
  const geometry = new PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT, segments, 1);
  const position = geometry.attributes.position as BufferAttribute;
  const normal = geometry.attributes.normal as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const angle = position.getX(i) / radius;
    position.setXYZ(i, radius * Math.sin(angle), position.getY(i), radius * Math.cos(angle));
    normal.setXYZ(i, Math.sin(angle), 0, Math.cos(angle));
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/** Fog range (near, far) for the room: the floor dissolves into the haze past the ring. */
export function fogRange(radius: number): [number, number] {
  return [radius * 2.2, radius * 9];
}
