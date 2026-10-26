import { bookingRules, STUDIO_TIME_ZONE } from "@/content/appointment";

/*
 * Bookable call times: every slot within the studio's hours on its working days, from
 * `leadMinutes` after `now` through the next `days` days. Worked out in the studio's time
 * zone, returned as UTC instants. Pure: everything comes from `now`.
 */

export interface Slot {
  /** UTC instant, ISO string: the value stored and submitted. */
  iso: string;
  /** Studio calendar day, YYYY-MM-DD, for grouping. */
  day: string;
  /** Studio wall-clock start, HH:MM. */
  time: string;
}

function parts(date: Date, timeZone: string): Record<string, number> {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  return Object.fromEntries(
    format
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** The zone's offset from UTC at `date`, in milliseconds. */
function offsetAt(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `timeZone` (the second pass settles DST edges). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(new Date(guess), timeZone);
  return new Date(guess - offsetAt(new Date(first), timeZone));
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function slotsFrom(now: Date, timeZone: string = STUDIO_TIME_ZONE): Slot[] {
  const { days, weekdays, firstStart, lastStart, slotMinutes, leadMinutes } = bookingRules;
  const today = parts(now, timeZone);
  const earliest = now.getTime() + leadMinutes * 60_000;
  const slots: Slot[] = [];
  for (let offset = 0; offset < days; offset++) {
    // A calendar date (UTC midnight stands for it): its weekday is the same in every zone.
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (!(weekdays as readonly number[]).includes(date.getUTCDay())) continue;
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    const last = lastStart[0] * 60 + lastStart[1];
    for (let minutes = firstStart[0] * 60 + firstStart[1]; minutes <= last; minutes += slotMinutes) {
      const [hour, minute] = [Math.floor(minutes / 60), minutes % 60];
      const start = zonedToUtc(y, m, d, hour, minute, timeZone);
      if (start.getTime() < earliest) continue;
      slots.push({ iso: start.toISOString(), day: `${y}-${pad(m)}-${pad(d)}`, time: `${pad(hour)}:${pad(minute)}` });
    }
  }
  return slots;
}

/** "Tue 27 Oct" for a YYYY-MM-DD studio day. Formatted on the server only, so it never drifts at hydration. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
