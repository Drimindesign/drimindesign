/*
 * Projects shown on the home ring and the Projects pages. Panel images are built by
 * scripts/prepare-project-images.py from the originals in assets/projects/ into
 * public/projects/<slug>-<width>.webp (7:5, one width per device tier). Case-study copy
 * and images live in project-details.ts (read only by the project pages).
 */

/** Widths the image script generates; keep in sync with WIDTHS in the script. */
export const PROJECT_IMAGE_WIDTHS = [700, 1000, 1400] as const;
export type ProjectImageWidth = (typeof PROJECT_IMAGE_WIDTHS)[number];

/** Filters on the Projects page. */
export const DISCIPLINES = ["Branding", "Print", "Apps"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export interface Project {
  slug: string;
  title: string;
  /** What the studio did, shown under the title. */
  category: string;
  /** Short description for alt text and the screen-reader list. */
  alt: string;
  disciplines: readonly Discipline[];
}

export const projects: readonly Project[] = [
  {
    slug: "munsey-pharmacy",
    title: "Munsey Pharmacy",
    category: "Brand collateral · Print",
    alt: "Munsey Pharmacy business card and a purple flyer listing its services",
    disciplines: ["Branding", "Print"],
  },
  {
    slug: "breeze-and-mist",
    title: "Breeze and Mist",
    category: "Brand identity",
    alt: "Stacks of Breeze and Mist business cards in sage green with a leaf monogram",
    disciplines: ["Branding", "Print"],
  },
  {
    slug: "breeze-and-grains",
    title: "Breeze and Grains",
    category: "Signage · Hospitality",
    alt: "Breeze and Grains resort at dusk with its illuminated sign over the entrance",
    disciplines: ["Branding"],
  },
  {
    slug: "shreeram-milks",
    title: "ShreeRam Milks",
    category: "App design",
    alt: "ShreeRam Milks app screens: welcome, phone sign-in, code verification and delivery address",
    disciplines: ["Apps"],
  },
  {
    slug: "speakora-onboarding",
    title: "Speakora",
    category: "App onboarding · UX",
    alt: "Speakora onboarding screens: username, interests, English test, reading test and completion",
    disciplines: ["Apps"],
  },
];

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

/** The project after this one, wrapping around (the "Next project" panel). */
export function nextProject(slug: string): Project {
  const index = projects.findIndex((project) => project.slug === slug);
  return projects[(index + 1) % projects.length];
}

/** The project's 7:5 panel image at the given width. */
export function projectImageUrl(project: Project, width: ProjectImageWidth): string {
  return `/projects/${project.slug}-${width}.webp`;
}
