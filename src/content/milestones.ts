/*
 * The studio's story, told up the tree as it grows (section 3): one milestone per tier of
 * branches, from the first tier at the bottom to "Today" at the peak. `tag` is the big
 * orange marker (a year or a number); `text` completes it.
 */

export interface Milestone {
  tag: string;
  text: string;
}

export const storyIntro = {
  title: "We begin with roots.",
  outro: "And we're still growing.",
} as const;

export const milestones: readonly Milestone[] = [
  { tag: "2023", text: "Started as a freelancer, with our very first client." },
  { tag: "15+", text: "Brand identities crafted." },
  { tag: "5–10", text: "Websites built, e-commerce stores included." },
  { tag: "3", text: "Real-world apps shipped." },
  { tag: "2", text: "More apps in the making right now." },
  { tag: "Today", text: "A studio handling multiple projects at once." },
];
