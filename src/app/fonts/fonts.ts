import localFont from "next/font/local";

/*
 * WOFF2 files are Latin subsets generated from assets/fonts/ (see DESIGN.md §3).
 * Outrun is caps-only and ~4 KB, so preloading it costs almost nothing and keeps
 * the wordmark (our LCP element) from swapping mid-intro.
 */
export const outrun = localFont({
  src: "./outrun-regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-outrun",
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
});

export const manrope = localFont({
  src: [
    { path: "./manrope-regular.woff2", weight: "400", style: "normal" },
    { path: "./manrope-medium.woff2", weight: "500", style: "normal" },
    { path: "./manrope-semibold.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-manrope",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
});

/*
 * Teko (SIL OFL), a condensed display face for the game's arena screens. Not preloaded: it's
 * only used once the arena opens.
 */
export const teko = localFont({
  src: "./teko-600.woff2",
  weight: "600",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-teko",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});
