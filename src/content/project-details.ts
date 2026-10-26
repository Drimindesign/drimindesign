/*
 * Case-study content for /projects/[slug]. App screens are cut from the originals by
 * scripts/prepare-project-details.py, and the photographic images (showcase, detail-a/b)
 * come from the generated set via scripts/prepare-generated-images.py, all into
 * public/projects/<slug>/<name>-<width>.webp; `ratio` (width / height) is each file's own.
 *
 * PLACEHOLDER: years and the story copy are drafts written from the work itself, waiting on
 * the client's notes; more photos per project are still to come (PRD.md §9).
 */

export interface CaseImage {
  /** Path without width and extension: /projects/<slug>/<name>. */
  src: string;
  ratio: number;
  alt: string;
  /** Width of the largest file; the generated photos are written at their own size. */
  full: number;
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

const image = (slug: string, name: string, ratio: number, alt: string, full = 1600): CaseImage => ({
  src: `/projects/${slug}/${name}`,
  ratio,
  alt,
  full,
});

/* The generated photos (scripts/prepare-generated-images.py): 3:2 landscape and 2:3 portrait. */
const showcase = (slug: string, alt: string): CaseImage => image(slug, "showcase", 1.5, alt, 1536);
const detail = (slug: string, which: "a" | "b", alt: string): CaseImage => image(slug, `detail-${which}`, 2 / 3, alt, 1024);

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
        kind: "wide",
        image: showcase("munsey-pharmacy", "The Munsey Pharmacy website open on a laptop on a bright pharmacy counter"),
        caption: "The website carries the same calm blue and plain-spoken tone as the print.",
      },
      {
        kind: "chapter",
        title: "The brief",
        body: "Explain everything the pharmacy offers, from compounding to vaccinations, without turning a flyer into a wall of text.",
      },
      {
        kind: "pair",
        images: [
          detail("munsey-pharmacy", "a", "A hand holding a phone showing the Munsey Pharmacy vaccination services post"),
          detail("munsey-pharmacy", "b", "The Munsey Pharmacy business card with the pharmacist's portrait on dark slate"),
        ],
        caption: "The card and the social posts share one deep blue and a single, legible type voice.",
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
        image: showcase("breeze-and-mist", "Breeze and Mist business cards, a folded t-shirt and a kraft envelope on cream linen"),
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
          detail("breeze-and-mist", "a", "A Breeze and Mist t-shirt with the leaf monogram hanging on a sage green wall"),
          detail("breeze-and-mist", "b", "Close-up of the Breeze and Mist monogram embossed on thick cream card"),
        ],
        caption: "On cloth and on card, the mark stays quiet and sure of itself.",
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
        image: showcase("breeze-and-grains", "The Breeze and Grains website open on a laptop on a veranda table among palms"),
        caption: "The website carries the sign's warm green and gold from the gate to the booking page.",
      },
      {
        kind: "chapter",
        title: "The challenge",
        body: "A sign has to work at dusk, at night and in daylight, from the gate and from the car park, without overpowering the architecture.",
      },
      {
        kind: "pair",
        images: [
          detail("breeze-and-grains", "a", "A brass key tag and a white towel, both marked with the Breeze and Grains logo"),
          detail("breeze-and-grains", "b", "A hand holding a phone showing the Breeze and Grains booking page"),
        ],
        caption: "The same mark on a key tag, a towel and a phone screen.",
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
        kind: "wide",
        image: showcase("shreeram-milks", "A phone showing the ShreeRam Milks home screen beside a glass bottle of milk on a doorstep"),
        caption: "Made for the doorstep at dawn.",
      },
      {
        kind: "pair",
        images: [
          detail("shreeram-milks", "a", "A phone showing the ShreeRam Milks cart screen beside a glass of milk"),
          detail("shreeram-milks", "b", "A hand holding a phone showing the ShreeRam Milks profile screen"),
        ],
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
        kind: "wide",
        image: showcase("speakora-onboarding", "A learner wearing an earbud practises speaking with the Speakora app on a phone stand"),
        caption: "Built for speaking out loud, anywhere there's a desk and a window.",
      },
      {
        kind: "pair",
        images: [
          detail("speakora-onboarding", "a", "A hand holding a phone showing the Speakora Finding Partner screen"),
          detail("speakora-onboarding", "b", "A phone on a desk showing the Speakora dashboard beside an earbuds case"),
        ],
      },
      {
        kind: "chapter",
        title: "The result",
        body: "A calm, monochrome flow that keeps attention on the voice, with one clear action per screen.",
      },
    ],
  },
};

/** The file for a case image: its small (800 wide) or its largest version. */
export function caseImageSrc(image: CaseImage, size: "small" | "full"): string {
  return `${image.src}-${size === "small" ? 800 : image.full}.webp`;
}
