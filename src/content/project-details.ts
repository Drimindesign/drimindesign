/*
 * Case-study content for /projects/[slug]. Images are cut from the originals by
 * scripts/prepare-project-details.py into public/projects/<slug>/<name>-{800,1600}.webp;
 * `ratio` (width / height) comes from the script's output.
 *
 * PLACEHOLDER: years and the story copy are drafts written from the work itself, waiting on
 * the client's notes; more photos per project are still to come (PRD.md §9).
 */

export interface CaseImage {
  /** Path without width and extension: /projects/<slug>/<name>. */
  src: string;
  ratio: number;
  alt: string;
}

export type CaseSection =
  /** Two images side by side (stacked on phones). */
  | { kind: "pair"; images: readonly [CaseImage, CaseImage]; caption?: string }
  /** One image across the content width. */
  | { kind: "wide"; image: CaseImage; caption?: string }
  /** App screens in a row (a swipeable strip on phones). */
  | { kind: "screens"; images: readonly CaseImage[]; caption?: string }
  /** A short chapter of the story beside its number. */
  | { kind: "chapter"; title: string; body: string };

export interface ProjectDetail {
  client: string;
  year: string;
  services: readonly string[];
  /** One or two sentences, set large under the hero. */
  intro: string;
  sections: readonly CaseSection[];
}

const image = (slug: string, name: string, ratio: number, alt: string): CaseImage => ({
  src: `/projects/${slug}/${name}`,
  ratio,
  alt,
});

const SCREEN = 0.449;
const SPEAKORA_SCREEN = 0.4401;

export const projectDetails: Record<string, ProjectDetail> = {
  "munsey-pharmacy": {
    client: "Munsey Pharmacy",
    year: "2024",
    services: ["Business cards", "Flyer design", "Print production"],
    intro:
      "A neighbourhood pharmacy needed print that felt as trustworthy as its pharmacists: clear, calm and easy to keep.",
    sections: [
      {
        kind: "pair",
        images: [
          image("munsey-pharmacy", "card", 0.994, "Munsey Pharmacy business card held in a hand, with a QR code and address"),
          image("munsey-pharmacy", "flyer", 0.994, "Munsey Pharmacy flyer in purple listing its services and free local delivery"),
        ],
        caption: "The card and the flyer share one deep blue and a single, legible type voice.",
      },
      {
        kind: "chapter",
        title: "The brief",
        body: "Explain everything the pharmacy offers, from compounding to vaccinations, without turning a flyer into a wall of text.",
      },
      {
        kind: "chapter",
        title: "The result",
        body: "A card with a QR code straight to the store, and a flyer that reads top to bottom in seconds: who they are, why choose them, how to reach them.",
      },
    ],
  },
  "breeze-and-mist": {
    client: "Breeze and Mist",
    year: "2024",
    services: ["Brand identity", "Logo", "Stationery"],
    intro: "An identity for a resort that promises calm: a leaf-and-wind monogram, sage green, and a pattern that moves like a breeze.",
    sections: [
      {
        kind: "wide",
        image: image("breeze-and-mist", "mark", 1.3333, "The Breeze and Mist leaf monogram printed on a cream business card"),
        caption: "The monogram: a leaf caught mid-turn, its stripes drawn like moving air.",
      },
      {
        kind: "chapter",
        title: "The idea",
        body: "Hospitality brands often shout. This one whispers: soft cream, a single green, and generous space around everything.",
      },
      {
        kind: "pair",
        images: [
          image("breeze-and-mist", "pattern", 1.3333, "Back of the Breeze and Mist card with the wave pattern and contact details"),
          image("breeze-and-mist", "stack", 1, "Stacks of Breeze and Mist business cards, front and back"),
        ],
      },
    ],
  },
  "breeze-and-grains": {
    client: "Breeze and Grains",
    year: "2024",
    services: ["Brand identity", "Signage", "Wayfinding"],
    intro: "Taking a brand off the page and onto the building: an illuminated sign that welcomes guests long after sunset.",
    sections: [
      {
        kind: "wide",
        image: image("breeze-and-grains", "sign", 2.2239, "Close-up of the illuminated Breeze and Grains sign glowing warm against the roof"),
        caption: "Backlit letters, sized to read from the road and warm enough to feel like an invitation.",
      },
      {
        kind: "chapter",
        title: "The challenge",
        body: "A sign has to work at dusk, at night and in daylight, from the gate and from the car park, without overpowering the architecture.",
      },
      {
        kind: "wide",
        image: image("breeze-and-grains", "entrance", 1.4824, "The Breeze and Grains resort entrance at dusk with lamps and the lit sign"),
      },
    ],
  },
  "shreeram-milks": {
    client: "ShreeRam Milks",
    year: "2025",
    services: ["App design", "UX", "Onboarding"],
    intro: "A milk-delivery app that gets a new customer from download to their first morning delivery in under a minute.",
    sections: [
      {
        kind: "screens",
        images: [
          image("shreeram-milks", "welcome", SCREEN, "ShreeRam Milks welcome screen: farm fresh milk, delivered before dawn"),
          image("shreeram-milks", "sign-in", SCREEN, "Sign-in screen with phone number and Google options"),
          image("shreeram-milks", "verify", SCREEN, "Six-digit code verification screen with a number pad"),
          image("shreeram-milks", "address", SCREEN, "Delivery address screen with a morning delivery slot"),
        ],
        caption: "Four screens, one decision each: welcome, sign in, verify, deliver.",
      },
      {
        kind: "chapter",
        title: "The approach",
        body: "Phone number first, because that's how milk is ordered today. The delivery slot comes before payment, so customers see the promise before the price.",
      },
      {
        kind: "chapter",
        title: "The detail",
        body: "Large tap targets for early-morning thumbs, and a recommended slot so most people never have to think.",
      },
    ],
  },
  "speakora-onboarding": {
    client: "Speakora",
    year: "2025",
    services: ["App design", "Onboarding", "UX"],
    intro: "An onboarding flow for an English-speaking app that tests a learner's level while feeling like the first lesson.",
    sections: [
      {
        kind: "screens",
        images: [
          image("speakora-onboarding", "username", SPEAKORA_SCREEN, "Step one: create your username"),
          image("speakora-onboarding", "interests", SPEAKORA_SCREEN, "Step two: select your interests from a grid"),
          image("speakora-onboarding", "english-test", SPEAKORA_SCREEN, "Step three: choose a speaking or reading test"),
          image("speakora-onboarding", "reading-test", SPEAKORA_SCREEN, "Step four: read a paragraph aloud while recording"),
          image("speakora-onboarding", "done", SPEAKORA_SCREEN, "Congratulations screen with an earned XP bonus"),
        ],
        caption: "Five steps with a progress bar, so the test never feels open-ended.",
      },
      {
        kind: "chapter",
        title: "The idea",
        body: "Placement tests feel like exams. This one feels like practice: you pick your interests, speak a little, and finish with a reward.",
      },
      {
        kind: "chapter",
        title: "The result",
        body: "A calm, monochrome flow that keeps attention on the voice, with one clear action per screen.",
      },
    ],
  },
};

/** Responsive sources for a case image (the script writes 800 and 1600 wide). */
export function caseImageSrc(image: CaseImage, width: 800 | 1600): string {
  return `${image.src}-${width}.webp`;
}
