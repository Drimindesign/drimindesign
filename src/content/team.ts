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
  title: "A small studio with a big appetite for craft.",
  body: "We're designers, developers and storytellers who treat every brand like our own. Pick up a pass and meet the people behind the work.",
  hint: "Drag a card. Tap to flip it.",
} as const;

/* PLACEHOLDER: names, roles and bios. */
export const team: readonly TeamMember[] = [
  {
    name: "Founder",
    role: "Creative direction",
    bio: "Started Drimin as a freelancer in 2023 and still sketches every first idea by hand.",
    since: "2023",
    photo: "/team/founder.webp",
  },
  {
    name: "Brand designer",
    role: "Identity & print",
    bio: "Builds logos, systems and packaging that hold up from a business card to a billboard.",
    since: "2024",
    photo: "/team/brand-designer.webp",
  },
  {
    name: "Developer",
    role: "Web & apps",
    bio: "Turns designs into fast, accessible websites and apps that feel as good as they look.",
    since: "2024",
    photo: "/team/developer.webp",
  },
  {
    name: "Motion designer",
    role: "Motion & 3D",
    bio: "Makes things move with weight and intent, from micro-interactions to launch films.",
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
