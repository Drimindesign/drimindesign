/*
 * Stage 1 palette: a forest at dawn, backlit by a low sun on the left. Depth comes from
 * atmosphere (far layers cool and violet, near layers dark), and every edge facing the sun
 * catches a warm rim, which is what makes the pixels read as lit rather than flat.
 */
export const DAWN = {
  sky: ["#1b2346", "#2c3466", "#4d4c80", "#85628a", "#c87c7f", "#eea67f", "#f8cf98", "#fbe3b4"],
  sun: "#fff6dc",
  sunHalo: ["#ffe7b3", "#f9c58f", "#f0a582"],
  cloud: "#f2a991",
  mountain: "#7d6694",
  mountainRim: "#c48a96",
  haze: "#e7a487",
  farPine: "#4c4775",
  farPineRim: "#b07c95",
  midTree: "#2e3253",
  midTreeAlt: "#2a3a4b",
  midRim: "#d88a72",
  mist: "#f0b59a",
  lake: ["#c9877f", "#9a6a82", "#5b4f78", "#3a3a62"],
  lakeGlint: "#ffe0ac",
  trunk: "#202128",
  trunkDark: "#16161c",
  trunkLight: "#33333b",
  trunkRim: "#e8a066",
  moss: "#3b5636",
  leafDark: "#1b2729",
  leafRim: "#c98059",
  bush: "#1a2924",
  grassTop: "#e2c27c",
  grass: "#6e8c4c",
  grassDark: "#4c6b3c",
  blade: "#86a85a",
  bladeTip: "#e7c985",
  path: "#6b4c3a",
  pathLight: "#8e6a50",
  soil: "#2c211c",
  soilDark: "#211915",
  stone: "#4b3d35",
  flower: ["#ee7a6e", "#f3e2a0", "#c9a2e8"],
  front: "#0e1214",
  frontRim: "#b8724a",
  mote: "#ffe4a8",
  outline: 0x140f14,
  rim: [255, 214, 158] as [number, number, number],
  /** Sun height as a share of the view (low at dawn), beam strength, and beam colour. */
  sunHeight: 0.47,
  rays: 1,
  rayRgb: "255, 220, 165",
  /** Stars in the sky (count per 10,000 art px²); 0 by day. */
  stars: 0,
} as const;

type Widen<T> = T extends string ? string : T extends readonly string[] ? readonly string[] : T extends number ? number : T;
/** A forest palette: the same roles as DAWN, any colours. */
export type Palette = { readonly [K in keyof typeof DAWN]: Widen<(typeof DAWN)[K]> };

/*
 * Bright morning: the sun high on the left, a clear blue sky fading pale at the horizon, fresh
 * greens, blue distance, and a white-gold rim of light on every sunlit edge.
 */
export const DAY: Palette = {
  sky: ["#2f7fd6", "#4a93e0", "#66a8ea", "#83bbf0", "#a0cdf4", "#bddcf6", "#d6e9f6", "#ebf3f3"],
  sun: "#fffdf2",
  sunHalo: ["#fffbe0", "#fff3c2", "#ffeab0"],
  cloud: "#ffffff",
  mountain: "#7f9cc0",
  mountainRim: "#e2ecf6",
  haze: "#cfe2f2",
  farPine: "#5d8496",
  farPineRim: "#c6dde2",
  midTree: "#2f6247",
  midTreeAlt: "#2b5560",
  midRim: "#d6efa8",
  mist: "#e6f1f7",
  lake: ["#a6d0ee", "#86b8e2", "#649dce", "#4b82b8"],
  lakeGlint: "#ffffff",
  trunk: "#4d3b2e",
  trunkDark: "#3b2d23",
  trunkLight: "#624d3d",
  trunkRim: "#f4dca8",
  moss: "#5f8e3d",
  leafDark: "#2f5d2c",
  leafRim: "#cbe78c",
  bush: "#386a30",
  grassTop: "#c2e684",
  grass: "#73b347",
  grassDark: "#548f37",
  blade: "#82c552",
  bladeTip: "#def494",
  path: "#8e6b4b",
  pathLight: "#ad8862",
  soil: "#4d3829",
  soilDark: "#3d2c20",
  stone: "#6f5e51",
  flower: ["#ee6a5e", "#ffe27a", "#c9a2e8"],
  front: "#1e3d23",
  frontRim: "#a3d36c",
  mote: "#fffbe6",
  outline: 0x1a1420,
  rim: [255, 246, 218],
  sunHeight: 0.15,
  rays: 0.5,
  rayRgb: "255, 252, 232",
  stars: 0,
};

/*
 * Night: a deep blue sky full of stars, a full moon high on the left (the "sun" here) with a
 * cold halo, silhouetted forest in blues, the lake holding the moon, and a cool silver rim of
 * moonlight on every edge facing it. Colour comes from the car's lights, not the sky.
 */
export const NIGHT: Palette = {
  sky: ["#04060f", "#070b1a", "#0b1226", "#101a33", "#152240", "#1b2b4d", "#22355a", "#2b4066"],
  sun: "#eef3ff",
  sunHalo: ["#2a3a63", "#22315a", "#1c2a4f"],
  cloud: "#1d2a48",
  mountain: "#141d34",
  mountainRim: "#3b4f7a",
  haze: "#1a2742",
  farPine: "#0f1729",
  farPineRim: "#2f4370",
  midTree: "#0b1220",
  midTreeAlt: "#0a1019",
  midRim: "#5d74a6",
  mist: "#22314f",
  lake: ["#1d2c4c", "#16233f", "#101b33", "#0b1428"],
  lakeGlint: "#dfe8ff",
  trunk: "#0b0d14",
  trunkDark: "#07080d",
  trunkLight: "#151926",
  trunkRim: "#6e84b8",
  moss: "#141f22",
  leafDark: "#0a1218",
  leafRim: "#56709f",
  bush: "#0b1416",
  grassTop: "#5f7aa0",
  grass: "#1d3029",
  grassDark: "#152420",
  blade: "#24382f",
  bladeTip: "#6f8db8",
  path: "#2b2622",
  pathLight: "#3d3630",
  soil: "#100e0d",
  soilDark: "#0b0a09",
  stone: "#26221f",
  flower: ["#6d5a8a", "#8aa0c8", "#5c6f9a"],
  front: "#03050a",
  frontRim: "#33456e",
  mote: "#b8d0ff",
  outline: 0x05060b,
  rim: [170, 196, 255],
  sunHeight: 0.18,
  rays: 0.12,
  rayRgb: "190, 210, 255",
  stars: 9,
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
