import { footer, site } from "./site";

/*
 * Privacy Policy and Terms of Use, written for what the site actually does today: two
 * forms (inquiry, booking), no accounts, no cookies, no analytics, two sessionStorage flags.
 * PLACEHOLDER: have a lawyer review both before launch, and add the legal entity name,
 * registered address and the city for jurisdiction once the client confirms them. Update
 * `updated` (and the consent version) whenever either document changes.
 */

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
  list?: readonly string[];
}

export interface LegalDocument {
  title: string;
  /** Meta description, 140–160 characters. */
  description: string;
  path: string;
  /** ISO date of the last change. */
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
}

const LAST_UPDATED = "2026-10-26";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  description:
    "How Drimindesign collects, uses and protects the details you share through our inquiry and booking forms, and the choices and rights you have over them.",
  path: "/privacy",
  updated: LAST_UPDATED,
  intro: `This policy explains what ${site.name} ("we", "us") collects when you use this website, why, and what you can do about it. We collect as little as we can, and we never sell your data.`,
  sections: [
    {
      heading: "What we collect",
      paragraphs: ["Only what you choose to send us, plus the minimum our servers need to run the site:"],
      list: [
        "Inquiry form: your name, company (optional), the service you need, your budget range and your email address.",
        "Booking form: your name, email address, what the call is about, an optional note, and the time you pick.",
        "Technical data: your IP address, used briefly to stop spam and abuse (rate limiting), and the standard request logs kept by our hosting provider.",
      ],
    },
    {
      heading: "Why we use it",
      paragraphs: [
        "We use your details only to reply to your inquiry, arrange and hold the call you booked, and keep a record of our conversation about your project. We rely on your consent, which you give by ticking the box on each form.",
        "We don't use your details for advertising, we don't build profiles, and we don't send newsletters unless you separately ask for them.",
      ],
    },
    {
      heading: "Cookies and storage",
      paragraphs: [
        "This site sets no cookies and runs no analytics or advertising trackers.",
        "Your browser's session storage holds two small flags so the opening animation and the hero hint don't repeat on every page. They contain no personal data and are cleared when you close the tab.",
      ],
    },
    {
      heading: "Who else sees it",
      paragraphs: [
        "Only the studio team working on your inquiry. The site is hosted on Cloudflare, which processes requests on our behalf. If we add a service to store or send your messages (for example an email or database provider), it will process your details only on our instructions.",
        "We may disclose data if the law requires it. We never sell or rent your data.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        "Inquiries and bookings are kept for as long as we're talking about your project, and for up to 24 months after our last contact, unless you ask us to delete them sooner or the law requires us to keep them longer. Rate-limit records last a few minutes.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Under India's Digital Personal Data Protection Act, 2023 and other laws that may apply to you, you can ask us to:",
        `Write to us at ${footer.email} and we'll respond within 30 days. If you're not satisfied with our answer, you may complain to the Data Protection Board of India or your local data protection authority.`,
      ],
      list: [
        "tell you what personal data we hold about you and how we use it;",
        "correct or complete it;",
        "delete it;",
        "withdraw your consent at any time (this doesn't affect anything we did before you withdrew it);",
        "name someone to exercise these rights for you in case of death or incapacity.",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "The site is served only over HTTPS, forms are validated on our servers, and access to your details is limited to the people who need them. No method of sending data over the internet is perfectly secure, but we take reasonable care to protect what you share.",
      ],
    },
    {
      heading: "Children",
      paragraphs: ["This site is meant for businesses and adults. We don't knowingly collect data from anyone under 18."],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "If we change this policy, we'll update it here and change the date above. If the change affects how we use details you've already sent, we'll ask for your consent again.",
        `Questions or requests about your data: ${footer.email}.`,
      ],
    },
  ],
};

export const termsOfUse: LegalDocument = {
  title: "Terms of Use",
  description:
    "The terms for using the Drimindesign website: our portfolio content, the inquiry and booking forms, intellectual property, and the limits of our responsibility.",
  path: "/terms",
  updated: LAST_UPDATED,
  intro: `These terms apply when you use this website. By using it, you agree to them. If you don't agree, please don't use the site.`,
  sections: [
    {
      heading: "About the site",
      paragraphs: [
        `This website presents ${site.name}, a brand, web and motion design studio: our work, our story, and ways to get in touch. Nothing on the site is an offer to sell; projects are agreed separately, in writing.`,
      ],
    },
    {
      heading: "Our work and content",
      paragraphs: [
        "The design, code, text, animations and images on this site belong to us or to the clients whose projects we show, who have allowed us to present them. Client names, logos and trademarks belong to their owners.",
        "You may view and share links to the site. You may not copy, reproduce, adapt or reuse our work, the case studies or the site itself for commercial purposes without our written permission.",
      ],
    },
    {
      heading: "Inquiries and bookings",
      paragraphs: [
        "Sending an inquiry or booking a call doesn't create a contract or oblige either of us to work together. Any project starts only once we've both agreed a written proposal or contract.",
        `A booked call is confirmed by email. If you can't make it, let us know at ${footer.email} so we can offer the time to someone else; we'll do the same if we need to move it.`,
        "Please give accurate details and don't use the forms to send spam, unlawful content or anything that could harm the site or other people.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: ["When using the site, you agree not to:"],
      list: [
        "try to gain unauthorised access to the site, its servers or its data;",
        "interfere with how the site works, including by overloading it or using automated tools to scrape it;",
        "use the site in a way that breaks the law or the rights of others.",
      ],
    },
    {
      heading: "No warranty",
      paragraphs: [
        "We work hard to keep the site accurate and available, but we provide it \"as is\". We don't promise it will always be available, error-free or up to date, and figures such as project counts are indicative.",
      ],
    },
    {
      heading: "Limitation of liability",
      paragraphs: [
        "To the extent the law allows, we aren't liable for any indirect or consequential loss arising from your use of the site, or for content on other websites we link to. Nothing in these terms limits liability that can't be limited by law.",
      ],
    },
    {
      heading: "Privacy",
      paragraphs: ["How we handle the details you send us is explained in our Privacy Policy."],
    },
    {
      heading: "Changes, law and contact",
      paragraphs: [
        "We may update these terms; the date above shows the latest version. These terms are governed by the laws of India, and any dispute will be handled by the courts that have jurisdiction over the studio's place of business.",
        `Questions about these terms: ${footer.email}.`,
      ],
    },
  ],
};

/* The consent line on both forms (a required checkbox: a clear, affirmative choice). */
export const consentCopy = {
  /** Stored with each inquiry and booking, so we know which policy the visitor agreed to. */
  version: LAST_UPDATED,
  before: "I agree that Drimindesign may use these details to reply to me, as set out in the",
  privacy: "Privacy Policy",
  between: "and",
  terms: "Terms of Use",
  error: "Please tick the box so we can use your details to reply.",
} as const;
