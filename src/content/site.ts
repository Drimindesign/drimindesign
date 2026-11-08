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
    "Drimindesign is a branding, website and app design agency in Pune, India: brand identity, logos, packaging, UI/UX and e-commerce websites for businesses.",
  /*
   * SEO (docs/seo-strategy.md): the home page title and the H1's hidden text name what the
   * studio does, in the words clients search for ("branding agency", "web design").
   */
  homeTitle: "Drimindesign — Branding, Web & App Design Agency in Pune",
  heading: "Drimindesign, a branding, website and app design agency in Pune",
  /** What the studio offers, for structured data (schema.org knowsAbout). */
  services: [
    "Brand identity design",
    "Logo design",
    "Packaging design",
    "Website design and development",
    "E-commerce website development",
    "UI/UX and app design",
    "Admin dashboard design",
  ],
  /** Where the studio is based (structured data and local search). */
  location: { city: "Pune", region: "Maharashtra", country: "IN" },
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
  /* The same figures as the story tree (content/milestones.ts); update both together. */
  stats: [
    { value: "15+", label: "Identities designed" },
    { value: "3", label: "Apps shipped" },
    { value: "2", label: "In progress" },
  ] satisfies Stat[],
  primaryAction: { label: "Book a call", href: "/appointment" },
  cta: { eyebrow: "Have an idea?", label: "Start a project", href: "/contact" },
} as const;

export const footer = {
  eyebrow: "Have an idea?",
  title: "Let's make it real.",
  email: "drimindesign@gmail.com",
  action: { label: "Book a call", href: "/appointment" },
  navTitle: "Explore",
  contactTitle: "Say hello",
  backToTop: "Back to top",
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Use", href: "/terms" },
    { label: "Sitemap", href: "/sitemap.html" },
  ] satisfies NavItem[],
} as const;
