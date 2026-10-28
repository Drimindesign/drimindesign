/*
 * About & Team copy. Values marked PLACEHOLDER are waiting on the client (PRD.md §9):
 * real names and bios. Portraits are built from the photos in public/team/ by
 * scripts/prepare-team-images.py (cropped to the card's photo window, tones untouched).
 */

export interface TeamMember {
  /** PLACEHOLDER until the client sends real names. */
  name: string;
  role: string;
  /** One or two sentences for the back of the ID card. */
  bio: string;
  /** Shown on the card as "Since <year>". */
  since: string;
  /** Portrait (1.04 : 1). */
  photo: string;
}

export const aboutIntro = {
  eyebrow: "About & team",
  title: "One idea. Considered from every angle.",
  body: "Your brand, website and product should feel like they belong together. We bring design and development around the same table, keeping the idea clear from the first sketch to the final interaction.",
  hint: "Drag a card. Tap to flip it.",
} as const;

/*
 * PLACEHOLDER: the QA tester's and software engineer's names (their role shows in the name
 * slot until then), and all bios.
 */
export const team: readonly TeamMember[] = [
  {
    name: "Dhruval Patel",
    role: "Designer & developer",
    bio: "Has been designing under the Drimin name since 2023 and still sketches every first idea by hand.",
    since: "2023",
    photo: "/team/founder.webp",
  },
  {
    name: "Krupa Patel",
    role: "Application designer",
    bio: "Designs the screens and flows of our apps, from the first sketch to the last pixel.",
    since: "2024",
    photo: "/team/brand-designer.webp",
  },
  {
    name: "QA Tester",
    role: "Quality assurance",
    bio: "Tests every page, flow and device before launch, so nothing ships broken.",
    since: "2024",
    photo: "/team/developer.webp",
  },
  {
    name: "Software Engineer",
    role: "Web & apps",
    bio: "Turns designs into fast, accessible websites and apps that feel as good as they look.",
    since: "2025",
    photo: "/team/motion-designer.webp",
  },
];

/** "Brand designer" → "BD". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
