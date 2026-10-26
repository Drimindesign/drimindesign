/*
 * Colours of the ring's room (DESIGN.md §9): a seamless studio backdrop (an "infinity cove")
 * in the hero's exact brand orange, lit like a real set. The backdrop at eye level is the
 * page's orange (and the fog, so the floor dissolves into it without an edge); a key light
 * makes a brighter, warmer hot spot behind the ring; light falls off toward the top, the
 * sides and the floor in front of the camera.
 */
const brand = {
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

/*
 * Small screens use a slightly milder orange (tokens.css: --color-orange-500 below 48rem):
 * every colour above mixed 12 % toward white, so the room still meets the page seamlessly.
 */
const mild: Record<keyof typeof brand, string> = {
  zenith: "#e6431f",
  horizon: "#fb471f",
  glow: "#ff6f42",
  shade: "#d9401f",
  floorLit: "#f3461f",
  floorMid: "#e3431f",
  floorDark: "#d03e1f",
  figure: brand.figure,
};

/** Must match the media query in tokens.css. */
const SMALL_SCREEN = "(max-width: 47.99rem)";

/* Chosen once when the scene loads (client only: the scene never renders on the server). */
export const stagePalette: Record<keyof typeof brand, string> =
  typeof window !== "undefined" && window.matchMedia(SMALL_SCREEN).matches ? mild : brand;
