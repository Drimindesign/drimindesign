import { connection } from "next/server";
import { appointmentRepository } from "@/server/repositories/appointment-repository";
import { BookingForm, type BookingDay } from "./components/booking-form";
import { dayLabel, slotsFrom } from "./slots";

/*
 * The only dynamic part of the page (AGENTS.md §3.2): open times depend on the clock and on
 * what's booked, so they render per request inside <Suspense>; the rest is a static shell.
 */
export async function Availability(): Promise<React.ReactElement> {
  await connection();
  const booked = await appointmentRepository.bookedSlots();
  const days = new Map<string, BookingDay>();
  for (const slot of slotsFrom(new Date())) {
    const day = days.get(slot.day) ?? { day: slot.day, label: dayLabel(slot.day), slots: [] };
    day.slots.push({ iso: slot.iso, time: slot.time, taken: booked.has(slot.iso) });
    days.set(slot.day, day);
  }
  return <BookingForm days={[...days.values()]} />;
}
