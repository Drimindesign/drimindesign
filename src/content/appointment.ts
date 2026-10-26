/*
 * Appointment page copy and booking rules (PRD.md §4). Times are stored in UTC and shown
 * in the studio's time zone. PLACEHOLDER: hours, call length and lead time, until the
 * client confirms them.
 */

export const STUDIO_TIME_ZONE = "Asia/Kolkata";
export const STUDIO_TIME_ZONE_LABEL = "IST";

export const bookingRules = {
  /** How far ahead the calendar opens, in calendar days (today included). */
  days: 14,
  /** Working days, 0 = Sunday. */
  weekdays: [1, 2, 3, 4, 5],
  /** First and last call start, studio time, as [hour, minute]. */
  firstStart: [10, 0],
  lastStart: [17, 30],
  slotMinutes: 30,
  /** No booking closer than this to its start. */
  leadMinutes: 120,
} as const;

export const appointmentCopy = {
  eyebrow: "Appointment",
  title: "Book a 30-minute call.",
  intro:
    "Pick a time, tell us a little about the project, and talk it through with the people who'd design it. No slides, no sales script.",
  dayLegend: "Pick a day",
  timeLegend: (day: string): string => `Pick a time on ${day} (${STUDIO_TIME_ZONE_LABEL})`,
  noTimes: "No times left on this day. Try another.",
  detailsLegend: "About you",
  submit: "Book the call",
  sending: "Booking…",
  successTitle: (name: string): string => `You're booked, ${name}.`,
  successBody: (when: string): string => `${when}. We'll confirm by email within one working day.`,
  again: "Book another time",
  loading: "Loading open times…",
} as const;
