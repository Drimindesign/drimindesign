/*
 * Inquiry section copy (PRD.md §4.7). The form reads as one sentence; each blank is a field.
 * PLACEHOLDER: budget bands and the reply promise, until the client confirms them.
 */

export const SERVICES = [
  "a brand identity",
  "a website",
  "an e-commerce store",
  "an app",
  "motion & 3D",
  "something else",
] as const;

export const BUDGETS = ["under ₹50k", "₹50k – ₹1.5L", "₹1.5L – ₹5L", "₹5L or more", "not sure yet"] as const;

export const inquiryCopy = {
  eyebrow: "Start a project",
  title: "Tell us what you're building.",
  body: "Fill in the blanks and we'll reply within one working day.",
  submit: "Send inquiry",
  sending: "Sending…",
  successTitle: (name: string): string => `Thanks, ${name}.`,
  successBody: "Your note is with us. We'll reply within one working day.",
  again: "Send another",
  email: "hello@drimindesign.com",
} as const;
