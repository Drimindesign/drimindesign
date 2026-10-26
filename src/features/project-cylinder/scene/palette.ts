/*
 * Colours of the ring's room (DESIGN.md §9): a seamless studio backdrop (an "infinity cove")
 * in the hero's exact brand orange, lit like a real set. The backdrop at eye level is
 * #FA2E00 (and the fog, so the floor dissolves into it without an edge); a key light makes a
 * brighter, warmer hot spot behind the ring; light falls off toward the top, the sides and
 * the floor in front of the camera.
 */
export const stagePalette = {
  /** Backdrop overhead, just outside the light. */
  zenith: "#e22900",
  /** Backdrop at eye level: the brand orange, also the fog colour. */
  horizon: "#fa2e00",
  /** Hot spot of the key light on the backdrop behind the ring. */
  glow: "#ff5b28",
  /** Backdrop toward the sides, where the light falls off. */
  shade: "#d42600",
  /** Floor under and around the ring, in the key light. */
  floorLit: "#f22d00",
  /** Halfway between the lit floor and the floor near the camera. */
  floorMid: "#df2900",
  /** Floor near the camera, furthest from the light. */
  floorDark: "#c92400",
  /** Standing figures. */
  figure: "#140402",
} as const;
