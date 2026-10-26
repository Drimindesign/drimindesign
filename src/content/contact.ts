import { footer } from "./site";

/*
 * Contact page copy (PRD.md §4). The page wraps the same fill-in-the-blanks inquiry as the
 * home page with the studio's direct lines. PLACEHOLDER: hours and location, until the
 * client confirms them.
 */
export const contactCopy = {
  eyebrow: "Contact",
  title: "Tell us what you're building.",
  intro: "Fill in the blanks below, or reach us directly. Every note is read by the people who'll design your project.",
  formTitle: "Start with a sentence",
  channels: [
    { label: "Email", value: footer.email, href: `mailto:${footer.email}` },
    { label: "Book a call", value: "30 minutes on video, no slides", href: "/appointment" },
  ],
  hoursLabel: "Studio hours",
  hours: "Monday to Friday, 10:00 – 18:00 IST",
  replyLabel: "Reply time",
  reply: "Within one working day",
  locationLabel: "Where we work",
  location: "From India, with clients worldwide",
} as const;
