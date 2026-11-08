import "server-only";
import { STUDIO_TIME_ZONE, STUDIO_TIME_ZONE_LABEL } from "@/content/appointment";
import type { AppointmentInput } from "@/features/appointment/schema";
import { sendStudioEmail } from "@/server/email/studio-email";

/*
 * Where appointments go (AGENTS.md §9). UI and actions depend on this interface. Each
 * booking is emailed to the studio inbox (server/email), so it is never lost.
 *
 * Taken slots are remembered in memory, which on Cloudflare is per server instance and
 * resets on deploys: it stops most double bookings but isn't a guarantee. The fix is a
 * database (e.g. Cloudflare D1) with a unique constraint on `slot`, swapped in here.
 */
export interface StoredAppointment extends AppointmentInput {
  id: string;
  createdAt: Date;
}

export interface AppointmentRepository {
  /** Slots (UTC ISO strings) already taken. */
  bookedSlots: () => Promise<ReadonlySet<string>>;
  /** Reserves the appointment's slot; null if someone else already has it. */
  reserve: (appointment: AppointmentInput) => Promise<StoredAppointment | null>;
}

const whenFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: STUDIO_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

class EmailAppointmentRepository implements AppointmentRepository {
  private readonly bySlot = new Map<string, StoredAppointment>();

  async bookedSlots(): Promise<ReadonlySet<string>> {
    return new Set(this.bySlot.keys());
  }

  async reserve(appointment: AppointmentInput): Promise<StoredAppointment | null> {
    // Claimed before the first await, so two requests on this instance can't both take it.
    if (this.bySlot.has(appointment.slot)) return null;
    const stored = { ...appointment, id: crypto.randomUUID(), createdAt: new Date() };
    this.bySlot.set(appointment.slot, stored);
    const when = `${whenFormat.format(new Date(appointment.slot))} ${STUDIO_TIME_ZONE_LABEL}`;
    try {
      await sendStudioEmail({
        subject: `New call booked: ${appointment.name}, ${when}`,
        lines: [
          ["When", when],
          ["Name", appointment.name],
          ["Email", appointment.email],
          ["About", appointment.topic],
          ["Note", appointment.note],
          ["Consented to privacy policy version", appointment.consent],
          ["Received", stored.createdAt.toISOString()],
          ["Reference", stored.id],
        ],
        replyTo: { email: appointment.email, name: appointment.name },
      });
    } catch (error) {
      // Not booked after all: free the slot so the visitor can try again.
      this.bySlot.delete(appointment.slot);
      throw error;
    }
    return stored;
  }
}

export const appointmentRepository: AppointmentRepository = new EmailAppointmentRepository();
