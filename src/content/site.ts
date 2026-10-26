/*
 * Site-wide copy. Values marked PLACEHOLDER are waiting on the client (PRD.md §9).
 */

export interface NavItem {
  label: string;
  href: string;
}

export interface Stat {
  value: string;
  label: string;
}

export const site = {
  name: "Drimindesign",
  shortName: "Drimin",
  tagline: "Vision and creativity to reality",
  /* PLACEHOLDER: replace with the real domain before launch. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "Drimindesign turns vision and creativity into reality: a brand, web and motion studio designing identities and websites that move with intent and get remembered.",
  themeColor: "#FA2E00",
} as const;

export const navItems: readonly NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Contact", href: "/contact" },
  { label: "Appointment", href: "/appointment" },
];

export const hero = {
  wordmark: "DRIMIN",
  /*
   * Advance width of `wordmark` in em, measured from Outrun's hmtx table
   * (D 372 + R 377 + I 189 + M 519 + I 189 + N 376 = 2022 / 1000 upm).
   * Lets CSS size the word to exactly fill the row. Re-measure if the word changes.
   */
  wordmarkWidthEm: 2.022,
  /*
   * Falling-words sentences, rotated in the hero. [Bracketed] words fall when clicked;
   * what stays must read as its own sentence (shown after the arrow).
   */
  sentences: [
    // → "We make brands move."
    "We [don't just] make brands [look good. We make them] move.",
    // → "Every idea becomes real."
    "Every idea [starts as a dream. We design the rest until it] becomes real.",
    // → "We turn vision and creativity into reality."
    "We turn [your wildest] vision and [boldest] creativity into [a living, breathing] reality.",
  ],
  /* PLACEHOLDER numbers. */
  stats: [
    { value: "60+", label: "Projects shipped" },
    { value: "12", label: "Countries" },
    { value: "8 yrs", label: "In practice" },
  ] satisfies Stat[],
  primaryAction: { label: "Book a call", href: "/appointment" },
  cta: { eyebrow: "Have an idea?", label: "Start a project", href: "/contact" },
} as const;

export const footer = {
  eyebrow: "Have an idea?",
  title: "Let's make it real.",
  /* PLACEHOLDER: confirm the studio inbox. */
  email: "hello@drimindesign.com",
  action: { label: "Book a call", href: "/appointment" },
  navTitle: "Explore",
  contactTitle: "Say hello",
  backToTop: "Back to top",
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Use", href: "/terms" },
  ] satisfies NavItem[],
} as const;
