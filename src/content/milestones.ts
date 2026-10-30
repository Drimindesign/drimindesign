/*
 * The studio's story, told up the tree as it grows (section 3): one milestone per tier of
 * branches, from the first tier at the bottom to "Today" at the peak. `tag` is the big
 * brand-colour marker (a year or a number); `text` completes it.
 */

export interface Milestone {
  tag: string;
  text: string;
}

export const storyIntro = {
  title: "One client was just the beginning.",
  outro: "The studio grows. The care stays personal.",
} as const;

export const milestones: readonly Milestone[] = [
  { tag: "2023", text: "One designer. One client. The start of Drimin." },
  { tag: "15+ identities", text: "Helping businesses find a look people recognise and a character they remember." },
  { tag: "Websites", text: "Bringing those identities to life, from the first impression to the final checkout." },
  { tag: "3 apps shipped", text: "Taking ideas off the drawing board and into people’s hands." },
  { tag: "2 in progress", text: "New products taking shape. New challenges making us better." },
  { tag: "Today", text: "A team bringing brand, design and development together—with the same personal care that started it all." },
];
